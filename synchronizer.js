const synchronizerModel = require('./synchronizer_db');

const dependenciesMap = {};

const buildDependenciesMap = async function () {
	const dependencies = await synchronizerModel.getDependencies();
	dependencies.forEach(dependency => {
		if (!dependenciesMap[dependency.db_name]) {
			dependenciesMap[dependency.db_name] = {};
		}
		if (!dependenciesMap[dependency.db_name][dependency.reference_collection]) {
			dependenciesMap[dependency.db_name][dependency.reference_collection] = [];
		}
		dependenciesMap[dependency.db_name][dependency.reference_collection].push({
			_id,
			dependent_collection,
			dependent_fields,
			fields_format,
			reference_key,
			dependent_key
		} = dependency);
	});
};


const extractFields = function (fieldsToSync) {
	const dependentFields = [];
	Object.keys(fieldsToSync).forEach(key => {
		if (Array.isArray(fieldsToSync[key])) {
			fieldsToSync[key].forEach(value => {
				if (typeof value !== 'string') {
					throw new Error("fieldsToSync - all array values need to be a string");
				}
				if (value[0] === "$") {
					dependentFields.push(value.substr(1));
				}
			});
			return;
		} else if (fieldsToSync[key][0] !== "$") {
			throw new Error("fieldsToSync - ref field name must start with $ sign");
		}
		dependentFields.push(fieldsToSync[key].substr(1));
	});
	return dependentFields;
};
const checkIfNeedToUpdate = function (dependency) {
	
	if (!dependenciesMap[dependency.db_name] ||
		!dependenciesMap[dependency.db_name][dependency.reference_collection]
	) {
		return "new";
	}
	const currentDependency = dependenciesMap[dependency.db_name][dependency.reference_collection];
	if (currentDependency.reference_key !== dependency.reference_key ||
		currentDependency.dependent_key !== dependency.dependent_key ||
		JSON.stringify(currentDependency.dependent_fields) !== JSON.stringify(dependency.dependent_fields) ||
		JSON.stringify(currentDependency.fields_format) !== JSON.stringify(dependency.fields_format)
	) {
		return currentDependency._id;
	}
	return false;
	
};

const checkConflict = function (dependency) {
	if (!dependenciesMap[dependency.db_name] ||
		!dependenciesMap[dependency.db_name][dependency.dependent_collection]
	) {
		return;
	}
	dependency.dependent_fields.forEach(field => {
		if (dependenciesMap[dependency.db_name][dependency.dependent_collection].dependent_fields.includes(field)) {
			throw new Error('a dependency conflict has accord in field ' + field);
		}
	});
};

const buildPipeline = function (dbs) {
	const dbsMatch = {$and: [{"ns.db": {$ne: 'mongodb_denormalized_data_sync_db'}}]};
	dbs.forEach(db => {
		dbsMatch.$and.push({
			"ns.db": db
		});
	});
	const pipeline = [
		{$match: {operationType: 'update', ...dbsMatch}},
	];
	return pipeline;
};

const _changeStreamLoop = async function (changeStreamIterator) {
	const next = await changeStreamIterator.next();
	console.log('next', next);
	if (!next || !next._id) {
		return _changeStreamLoop(changeStreamIterator);
	}
	try {
		await synchronizerModel.addResumeToken({token: next._id});
		return _changeStreamLoop(changeStreamIterator);
	}
	catch (e) {
		console.error(e);
		return _changeStreamLoop(changeStreamIterator);
	}
};

exports.start = async function (dbs = []) {
	const client = await synchronizerModel.connect(process.env.MONGODB_URL, process.env.MONGODB_OPTIONS);
	await buildDependenciesMap();
	console.log("dependenciesMap", dependenciesMap);
	const oldResumeTokenDoc = await synchronizerModel.getResumeToken();
	const resumeAfter = oldResumeTokenDoc ? oldResumeTokenDoc.token : undefined;
	const pipeline = buildPipeline(dbs);
	const changeStream = client.watch(pipeline, {resumeAfter});
	
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
		dependent_fields: extractFields(body.fieldsToSync)
	};
	
	const {error, value} = synchronizerModel.validate(payload);
	if (error) {
		throw new Error(error);
	}
	const id = checkIfNeedToUpdate(value);
	if (id === false) {
		return;
	}
	checkConflict(value);
	return synchronizerModel.addDependency(id, value);
	
};