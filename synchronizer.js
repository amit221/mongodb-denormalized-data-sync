const synchronizerModel = require("./synchronizer_db");
const {debug} = require("./utils");
const dependenciesMap = {};
const referenceKeyProject = {};
let pauseChangeStreamLoop = true;
let changeStream;
let dbClient;

const _sleep = (time) => {
	return new Promise(resolve => {
		setTimeout(() => {
			resolve();
		}, time);
	});
};

const _initChangeStream = async function () {
	pauseChangeStreamLoop = true;
	
	if (changeStream) {
		await changeStream.close();
		changeStream = null;
	}
	
	const oldResumeTokenDoc = await synchronizerModel.getResumeToken();
	const resumeAfter = oldResumeTokenDoc ? oldResumeTokenDoc.token : undefined;
	let {pipeline, fullDocument} = _buildPipeline();
	fullDocument = fullDocument ? "updateLookup" : undefined;
	
	if (pipeline[0].$match.$or.length === 0) {
		return;
	}
	
	changeStream = dbClient.watch(pipeline, {resumeAfter, fullDocument});
	changeStream.on("error", err => {
		console.error(err);
		process.exit();
	});
	pauseChangeStreamLoop = false;
	
};

const _buildDependenciesMap = async function () {
	const dependencies = await synchronizerModel.getDependencies();
	dependencies.forEach(dependency => {
		if (!dependenciesMap[dependency.db_name]) {
			dependenciesMap[dependency.db_name] = {};
		}
		if (!dependenciesMap[dependency.db_name][dependency.reference_collection]) {
			dependenciesMap[dependency.db_name][dependency.reference_collection] = [];
		}
		referenceKeyProject[dependency.reference_key] = 1;
		dependenciesMap[dependency.db_name][dependency.reference_collection].push({
			_id,
			dependent_collection,
			dependent_fields,
			fields_format,
			reference_key,
			dependent_key
		} = dependency);
	});
	debug("dependenciesMap:\n", JSON.stringify(dependenciesMap));
	
};

const _extractFields = function (fieldsToSync) {
	const dependentFields = new Set();
	Object.keys(fieldsToSync).forEach(key => {
		dependentFields.add(fieldsToSync[key]);
	});
	return [...dependentFields];
};
const _checkIfNeedToUpdate = function (dependency) {
	let id = "new";
	if (!dependenciesMap[dependency.db_name] ||
		!dependenciesMap[dependency.db_name][dependency.reference_collection]
	) {
		return id;
	}
	dependenciesMap[dependency.db_name][dependency.reference_collection].some(currentDependency => {
		if (currentDependency.reference_key !== dependency.reference_key ||
			currentDependency.dependent_key !== dependency.dependent_key ||
			JSON.stringify(currentDependency.dependent_fields) !== JSON.stringify(dependency.dependent_fields)
		) {
			return false;
		}
		id = currentDependency._id;
		return true;
		
	});
	
	return id;
	
};

const _checkConflict = function (dependency) {
	if (!dependenciesMap[dependency.db_name] ||
		!dependenciesMap[dependency.db_name][dependency.dependent_collection]
	) {
		return;
	}
	dependenciesMap[dependency.db_name][dependency.reference_collection].forEach(({reference_key, dependent_collection}) => {
		if (dependency.dependent_collection === dependent_collection && reference_key !== dependency.reference_key) {
			throw new Error(`there can only be one foreignField between the collections ${dependency.reference_collection} , ${dependency.dependent_collection} the current key is ${dependency.reference_key}`);
		}
	});
	
	dependency.dependent_fields.forEach(field => {
		dependenciesMap[dependency.db_name][dependency.dependent_collection].forEach(dependency => {
			if (dependency.dependent_fields.includes(field)) {
				throw new Error("a dependency conflict has accord in field " + field);
			}
			
		});
	});
};

const _buildPipeline = function () {
	let fullDocument = false;
	const $or = [];
	const $match = {operationType: "update", $or};
	const pipeline = [
		{$match}
	];
	
	Object.keys(dependenciesMap).forEach(dbName => {
		Object.keys(dependenciesMap[dbName]).forEach(collName => {
			$or.push({"ns.db": dbName, "ns.coll": collName});
		});
	});
	
	const project = {documentKey: 1, updateDescription: 1, ns: 1};
	
	Object.keys(referenceKeyProject).forEach(key => {
		if (key !== "_id") {
			project.fullDocument[key] = 1;
			fullDocument = true;
		}
	});
	pipeline.push({
		$project: project
	});
	return {pipeline, fullDocument};
};


const _changeStreamLoop = async function () {
	if (pauseChangeStreamLoop === true) {
		await _sleep(500);
		return _changeStreamLoop();
	}
	const next = await changeStream.next();
	if (!next || !next._id) {
		return;
	}
	try {
		const needToUpdateObj = _getNeedToUpdateDependencies(next);
		if (Object.keys(needToUpdateObj).length === 0) {
			return _changeStreamLoop();
			
		}
		await synchronizerModel.addResumeToken({token: next._id});
		await _updateCollections(needToUpdateObj);
		
		return _changeStreamLoop();
	} catch (e) {
		console.error(e);
		return _changeStreamLoop();
	}
};

const _getNeedToUpdateDependencies = function ({ns, documentKey, updateDescription, fullDocument}) {
	const needToUpdateObj = {};
	if (!dependenciesMap[ns.db] ||
		!dependenciesMap[ns.db][ns.coll]
	) {
		return;
	}
	const changedFields = updateDescription.updatedFields;
	dependenciesMap[ns.db][ns.coll].forEach(dependency => {
		if (dependency.dependent_fields.some(field => changedFields[field]) === false) {
			return;
		}
		const refKey = dependency.reference_key === "_id" ? documentKey._id : fullDocument[dependency.reference_key];
		Object.keys(dependency.fields_format).forEach(dependentField => {
			if (changedFields[dependency.fields_format[dependentField]] === undefined) {
				return;
			}
			if (!needToUpdateObj[ns.db]) {
				needToUpdateObj[ns.db] = {};
			}
			if (!needToUpdateObj[ns.db][dependency.dependent_collection]) {
				needToUpdateObj[ns.db][dependency.dependent_collection] = {
					refKey,
					dependentKeys: {}
				};
			}
			if (!needToUpdateObj[ns.db][dependency.dependent_collection].dependentKeys[dependency.dependent_key]) {
				needToUpdateObj[ns.db][dependency.dependent_collection].dependentKeys[dependency.dependent_key] = {};
			}
			
			needToUpdateObj[ns.db][dependency.dependent_collection].dependentKeys[dependency.dependent_key][dependentField] = changedFields[dependency.fields_format[dependentField]];
		});
	});
	debug("needToUpdateObj:\n", JSON.stringify(needToUpdateObj));
	return needToUpdateObj;
};


const _updateCollections = function (needToUpdateObj) {
	const all = [];
	Object.keys(needToUpdateObj).forEach(dbName => {
		const db = dbClient.db(dbName);
		Object.keys(needToUpdateObj[dbName]).forEach(collName => {
			const collection = db.collection(collName);
			Object.keys(needToUpdateObj[dbName][collName].dependentKeys).forEach(dependentKey => {
				debug("update payload:\n", JSON.stringify({...needToUpdateObj[dbName][collName].dependentKeys[dependentKey]}));
				all.push(
					collection.updateOne({[dependentKey]: needToUpdateObj[dbName][collName].refKey}, {$set: {...needToUpdateObj[dbName][collName].dependentKeys[dependentKey]}})
				);
			});
			
		});
	});
	return Promise.all(all);
};

exports.start = async function () {
	dbClient = await synchronizerModel.connect(process.env.MONGODB_URL, process.env.MONGODB_OPTIONS);
	await _buildDependenciesMap();
	await _initChangeStream();
	await _changeStreamLoop(changeStream);
};

exports.addDependency = async function (body) {
	const payload = {
		db_name: body.dbName,
		reference_collection: body.refCollection,
		dependent_collection: body.dependentCollection,
		reference_key: body.foreignField,
		dependent_key: body.localField,
		fields_format: body.fieldsToSync,
		dependent_fields: _extractFields(body.fieldsToSync)
	};
	
	const {error, value} = synchronizerModel.validate(payload);
	if (error) {
		throw new Error(error);
	}
	const id = _checkIfNeedToUpdate(value);
	if (id !== "new") {
		return id;
	}
	
	_checkConflict(value);
	const result = await synchronizerModel.addDependency(value);
	await _buildDependenciesMap();
	await _initChangeStream();
	
	return result.insertedId;
	
	
};

exports.removeDependency = async function (id) {
	const result = await synchronizerModel.removeDependency(id);
	if (result.n > 0) {
		await _buildDependenciesMap();
		await _initChangeStream();
		
	}
};

exports.showDependencies = function () {
	return dependenciesMap;
};
exports.syncAll = async function (dbs) {

};
