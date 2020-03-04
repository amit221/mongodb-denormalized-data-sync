const synchronizerModel = require("./synchronizer_db");
const {debug, getObjectPropFromString, DUPLICATE_CODE_ERROR, RESUME_TOKEN_ERROR, CHANGE_STREAM_FATAL_ERROR} = require("./utils");
const mysql = require("promise-mysql");
const {ObjectId} = require("mongodb");
let dependenciesMap = {};
const referenceKeyProject = {};
let changeStream;
let mysqlPingInterval;
let dbClient, mysqlOptions;
const mysqlConnection = {};
if (process.env.MYSQL) {
	mysqlOptions = JSON.parse(process.env.MYSQL);
	mysqlOptions.multipleStatements = true;
}

if (process.env.debug) {
	require("console-from");
}

process.stdin.resume();
const exitHandler = async (options) => {
	await synchronizerModel.closeConnection();
	for (const dbName in mysqlConnection) {
		if (typeof mysqlConnection[dbName].end === "function") {
			await mysqlConnection[dbName].end();
		}
	}
	if (options.exit === true) {
		process.exit();
		
	}
};


process.on("exit", exitHandler.bind(null, {}));
process.on("SIGTERM", exitHandler.bind(null, {exit: true}));
process.on("SIGINT", exitHandler.bind(null, {exit: true}));
process.on("SIGUSR1", exitHandler.bind(null, {exit: true}));
process.on("SIGUSR2", exitHandler.bind(null, {exit: true}));


const _checkMySqlConnections = () => {
	clearInterval(mysqlPingInterval);
	mysqlPingInterval = setInterval(async () => {
		for (const dbName in mysqlConnection) {
			try {
				await mysqlConnection[dbName].ping();
			} catch (e) {
				await mysql.createConnection({...mysqlOptions, database: dbName});
			}
		}
	}, 100);
	
};

const _removeResumeTokenAndInit = async function (err) {
	if (err.code === RESUME_TOKEN_ERROR || err.code === CHANGE_STREAM_FATAL_ERROR) {
		changeStream = undefined;
		const oldResumeTokenDoc = await synchronizerModel.getResumeToken("sync");
		await synchronizerModel.removeResumeToken("sync");
		syncAll({cleanOldSyncTasks: true, fromDate: oldResumeTokenDoc.last_update}).catch(console.error);
		await _initChangeStream();
		return false;
	}
	return true;
};

const _initChangeStream = async function () {
	if (changeStream) {
		await changeStream.close();
	}
	const oldResumeTokenDoc = await synchronizerModel.getResumeToken();
	const resumeAfter = oldResumeTokenDoc ? oldResumeTokenDoc.token : undefined;
	let {pipeline, fullDocument} = _buildPipeline();
	fullDocument = fullDocument ? "updateLookup" : undefined;
	if (pipeline[0].$match.$or.length === 0) {
		return;
	}
	
	changeStream = dbClient.watch(pipeline, {resumeAfter, fullDocument});
	changeStream.on("change", next => {
		_changeStreamLoop(next);
	});
	changeStream.on("error", async err => {
		if (await _removeResumeTokenAndInit(err) === true) {
			console.error(err);
			process.exit();
		}
	});
};


const _buildDependenciesMap = async function () {
	const dependencies = await synchronizerModel.getDependencies();
	dependenciesMap = {};
	const newMysqlDbs = [];
	dependencies.forEach(dependency => {
		
		dependency.fields_format = typeof dependency.fields_format === "string" ? JSON.parse(dependency.fields_format) : dependency.fields_format;
		dependenciesMap[dependency.db_name] = dependenciesMap[dependency.db_name] || {};
		dependenciesMap[dependency.db_name][dependency.reference_collection] = dependenciesMap[dependency.db_name][dependency.reference_collection] || [];
		dependenciesMap[dependency.db_name][dependency.dependent_collection] = dependenciesMap[dependency.db_name][dependency.dependent_collection] || [];
		
		referenceKeyProject[dependency.reference_key] = 1;
		
		dependenciesMap[dependency.db_name][dependency.reference_collection].push({
			_id: dependency._id,
			type: "ref",
			dependent_collection: dependency.dependent_collection,
			dependent_fields: dependency.dependent_fields,
			fields_format: dependency.fields_format,
			reference_key: dependency.reference_key,
			dependent_key: dependency.dependent_key,
			reference_collection_last_update_field: dependency.reference_collection_last_update_field
			
		});
		const [mysqlPrefix, mysqlDbName] = dependency.dependent_collection.split(".");
		if (mysqlPrefix === "mysql" && !mysqlConnection[mysqlDbName]) {
			newMysqlDbs.push(mysqlDbName);
			return;
		}
		
		dependenciesMap[dependency.db_name][dependency.dependent_collection].push({
			_id: dependency._id,
			type: "local",
			fetch_from_collection: dependency.reference_collection,
			local_collection: dependency.dependent_collection,
			fields_format: dependency.fields_format,
			fetch_from_key: dependency.reference_key,
			local_key: dependency.dependent_key,
			
		});
	});
	
	for (const i in newMysqlDbs) {
		mysqlConnection[newMysqlDbs[i]] = await mysql.createConnection({
			...mysqlOptions,
			database: newMysqlDbs[i]
		});
	}
	debug("dependenciesMap:\n", JSON.stringify(dependenciesMap));
	debug("mysqlConnections:\n", JSON.stringify(Object.keys(mysqlConnection)));
	
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
		!dependenciesMap[dependency.db_name][dependency.reference_collection] ||
		dependenciesMap[dependency.db_name][dependency.reference_collection] && !dependenciesMap[dependency.db_name][dependency.reference_collection].some(dep => {
			return dependency.dependent_collection === dep.dependent_collection;
		})
	) {
		return id;
	}
	dependenciesMap[dependency.db_name][dependency.reference_collection].some(currentDependency => {
		if (currentDependency.type === "local" ||
			currentDependency.reference_key !== dependency.reference_key ||
			currentDependency.dependent_key !== dependency.dependent_key ||
			JSON.stringify(currentDependency.dependent_fields) !== JSON.stringify(dependency.dependent_fields)
		) {
			return false;
		}
		if (dependency.dependent_collection === currentDependency.dependent_collection) {
			id = currentDependency._id;
			return true;
		}
	});
	
	return id;
	
};

const _checkConflict = function (dependency) {
	if (!dependenciesMap[dependency.db_name] ||
		!dependenciesMap[dependency.db_name][dependency.dependent_collection] ||
		!dependenciesMap[dependency.db_name][dependency.reference_collection]
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
			if (dependency.type !== "local" && dependency.dependent_fields.includes(field)) {
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

const _changeStreamLoop = async function (next) {
	
	
	if (!next || !next._id) {
		return;
	}
	try {
		const needToUpdateObj = await _getNeedToUpdateDependencies(next);
		
		if (Object.keys(needToUpdateObj).length === 0) {
			return;
		}
		await synchronizerModel.addResumeToken({token: next._id}, "sync");
		
		await _updateCollections(needToUpdateObj);
		
	} catch (e) {
		console.error(e);
	}
	
	
};

const _getNeedToUpdateDependencies = async function ({ns, documentKey, updateDescription, fullDocument}) {
	const needToUpdateObj = {};
	if (!dependenciesMap[ns.db] ||
		!dependenciesMap[ns.db][ns.coll]
	) {
		return;
	}
	
	const changedFields = updateDescription.updatedFields;
	
	const addRefDep = (dependency) => {
		if (dependency.type !== "ref" || dependency.dependent_fields.some(field => changedFields[field]) === false) {
			return;
		}
		const refKey = dependency.reference_key === "_id" ? documentKey._id : fullDocument[dependency.reference_key];
		Object.keys(dependency.fields_format).forEach(dependentField => {
			if (changedFields[dependency.fields_format[dependentField]] === undefined) {
				return;
			}
			needToUpdateObj[ns.db] = needToUpdateObj[ns.db] || {};
			
			needToUpdateObj[ns.db][dependency.dependent_collection] = needToUpdateObj[ns.db][dependency.dependent_collection] || {
				refKey,
				dependentKeys: {}
			};
			if (!needToUpdateObj[ns.db][dependency.dependent_collection].dependentKeys[dependency.dependent_key]) {
				needToUpdateObj[ns.db][dependency.dependent_collection].dependentKeys[dependency.dependent_key] = {};
			}
			
			needToUpdateObj[ns.db][dependency.dependent_collection].dependentKeys[dependency.dependent_key][dependentField] = changedFields[dependency.fields_format[dependentField]];
		});
	};
	const addLocalDep = async (dbName, dependency) => {
		
		
		if (dependency.type !== "local" || changedFields[dependency.local_key] === undefined) {
			return;
		}
		const db = dbClient.db(dbName);
		const collection = db.collection(dependency.fetch_from_collection);
		
		const projection = {};
		Object.keys(dependency.fields_format).forEach(dependentField => {
			projection[dependency.fields_format[dependentField]] = 1;
		});
		const fetchResult = await collection.findOne({[dependency.fetch_from_key]: changedFields[dependency.local_key]}, {projection});
		
		needToUpdateObj[ns.db] = needToUpdateObj[ns.db] || {};
		needToUpdateObj[ns.db][dependency.local_collection] = needToUpdateObj[ns.db][dependency.local_collection] || {
			_id: documentKey._id,
			localKeys: {}
		};
		
		Object.keys(dependency.fields_format).forEach(dependentField => {
			needToUpdateObj[ns.db][dependency.local_collection].localKeys[dependentField] = fetchResult[dependency.fields_format[dependentField]];
		});
	};
	for (let i in dependenciesMap[ns.db][ns.coll]) {
		addRefDep(dependenciesMap[ns.db][ns.coll][i]);
		await addLocalDep(ns.db, dependenciesMap[ns.db][ns.coll][i]);
	}
	
	debug("needToUpdateObj:\n", JSON.stringify(needToUpdateObj));
	return needToUpdateObj;
};


const _updateCollections = function (needToUpdateObj) {
	const all = [];
	const updateFromRefs = (dbName, collName) => {
		if (!needToUpdateObj[dbName][collName].dependentKeys || collName.split(".")[1]) {
			return;
		}
		
		const db = dbClient.db(dbName);
		const collection = db.collection(collName);
		Object.keys(needToUpdateObj[dbName][collName].dependentKeys).forEach(dependentKey => {
			
			debug("update payload:\n", JSON.stringify({...needToUpdateObj[dbName][collName].dependentKeys[dependentKey]}));
			all.push(
				collection.updateMany({[dependentKey]: needToUpdateObj[dbName][collName].refKey}, {$set: {...needToUpdateObj[dbName][collName].dependentKeys[dependentKey]}})
			);
		});
	};
	const updateMysql = (dbName, tableNameWithPrefix) => {
		const [mysqlPrefix, mysqlDbName, tableName] = tableNameWithPrefix.split(".");
		if (mysqlPrefix !== "mysql") {
			return;
		}
		
		Object.keys(needToUpdateObj[dbName][tableNameWithPrefix].dependentKeys).forEach(dependentKey => {
			debug("update payload:\n", JSON.stringify({...needToUpdateObj[dbName][tableNameWithPrefix].dependentKeys[dependentKey]}));
			const queryParams = [];
			let query = `update \`${mysqlDbName}\`.\`${tableName}\` set `;
			Object.keys(needToUpdateObj[dbName][tableNameWithPrefix].dependentKeys[dependentKey]).forEach((value, key) => {
				query += ` \`${value}\`  = ? ,`;
				queryParams.push(needToUpdateObj[dbName][tableNameWithPrefix].dependentKeys[dependentKey][value]);
			});
			query = query.substr(0, query.length - 1);
			query += `where  \`${dependentKey}\` = ?`;
			
			queryParams.push(needToUpdateObj[dbName][tableNameWithPrefix].refKey.toString());
			all.push(
				mysqlConnection[mysqlDbName].query(query, queryParams)
			);
		});
		
	};
	
	const updateFromLocals = (dbName, collName,) => {
		
		if (!needToUpdateObj[dbName][collName].localKeys || collName.split(".")[1]) {
			return;
		}
		const db = dbClient.db(dbName);
		const collection = db.collection(collName);
		debug("update payload:\n", JSON.stringify({...needToUpdateObj[dbName][collName].localKeys}));
		all.push(
			collection.updateOne({_id: needToUpdateObj[dbName][collName]._id}, {$set: {...needToUpdateObj[dbName][collName].localKeys}})
		);
	};
	
	Object.keys(needToUpdateObj).forEach(dbName => {
		Object.keys(needToUpdateObj[dbName]).forEach(collName => {
			updateMysql(dbName, collName);
			updateFromRefs(dbName, collName);
			updateFromLocals(dbName, collName);
		});
	});
	return Promise.all(all);
};

const _createSyncItems = async function (dbs, batchSize) {
	for (const db in dependenciesMap) {
		if (dbs && !dbs[db]) {
			continue;
		}
		for (const referenceCollection in dependenciesMap[db]) {
			for (const i in dependenciesMap[db][referenceCollection]) {
				if (dependenciesMap[db][referenceCollection][i].type !== "ref") {
					continue;
				}
				await _createSyncItem({
					...dependenciesMap[db][referenceCollection][i],
					reference_collection: referenceCollection,
					batchSize,
					db_name: db
				});
			}
		}
	}
};
const _createSyncItem = async function ({db_name, reference_collection, dependent_collection, dependent_fields, fields_format, reference_key, dependent_key, batchSize, last_id_checked}) {
	
	
	const {error, value} = synchronizerModel.validateSync({
		db_name,
		reference_collection,
		dependent_collection,
		dependent_fields,
		fields_format,
		reference_key,
		dependent_key,
		batchSize,
		last_id_checked
	});
	if (error) {
		console.error(error);
		return;
	}
	try {
		await synchronizerModel.addSyncItem(value);
	} catch (e) {
		if (e.code !== DUPLICATE_CODE_ERROR) {
			throw e;
		}
	}
	
	
};

exports.start = async function () {
	dbClient = await synchronizerModel.connect(process.env.MONGODB_URL, process.env.MONGODB_OPTIONS);
	await _buildDependenciesMap();
	await _initChangeStream();
	_checkMySqlConnections();
};
exports.pause = async function () {
	await changeStream.close();
};
exports.continue = async function () {
	await _buildDependenciesMap();
	await _initChangeStream();
};

exports.addDependency = async function (body) {
	const payload = {
		db_name: body.dbName,
		reference_collection: body.refCollection,
		dependent_collection: body.dependentCollection,
		reference_key: body.foreignField,
		dependent_key: body.localField,
		fields_format: JSON.stringify(body.fieldsToSync),
		dependent_fields: _extractFields(body.fieldsToSync),
		reference_collection_last_update_field: body.refCollectionLastUpdateField
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
	value.fields_format = JSON.stringify(body.fieldsToSync);
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
const _updateSyncItemBatchResults = async function ({syncItem, documents, dependentCollection}) {
	
	const bulk = [];
	
	const updateMongo = async () => {
		if (syncItem.dependent_collection.split(".")[0] === "mysql") {
			return;
		}
		documents.forEach(doc => {
			const payload = {};
			for (let dependentField in syncItem.fields_format) {
				let value = getObjectPropFromString(doc, syncItem.fields_format[dependentField]);
				if (value === undefined) {
					continue;
				}
				payload[dependentField] = value;
			}
			bulk.push({
				updateMany: {
					"filter": {[syncItem.dependent_key]: doc[syncItem.reference_key]},
					"update": {$set: payload}
				}
			});
		});
		debug("_updateSyncItemBatchResults", JSON.stringify(bulk));
		return dependentCollection.bulkWrite(bulk);
	};
	
	const updateMysql = async () => {
		const [prefix, mysqlDbName, tableName] = syncItem.dependent_collection.split(".");
		if (prefix !== "mysql") {
			return;
		}
		let query = "";
		documents.forEach(doc => {
			let needQuery = true;
			
			for (let dependentField in syncItem.fields_format) {
				let value = getObjectPropFromString(doc, syncItem.fields_format[dependentField]);
				if (value === undefined) {
					continue;
				}
				if (needQuery === true) {
					query += ` update \`${tableName}\` set  `;
					needQuery = false;
				}
				if (value instanceof ObjectId) {
					value = value.toString();
				}
				query += ` \`${dependentField}\`= ${mysql.escape(value)} ,`;
			}
			if (needQuery === true) {
				return;
			}
			let refKey = doc[syncItem.reference_key];
			if (refKey instanceof ObjectId) {
				refKey = refKey.toString();
			}
			query = query.replace(/,$/, "");
			query += ` where \`${syncItem.dependent_key}\` = ${mysql.escape(refKey)} ;`;
		});
		
		
		await mysqlConnection[mysqlDbName].beginTransaction();
		try {
			await mysqlConnection[mysqlDbName].query(query);
			await mysqlConnection[mysqlDbName].commit();
		}
		catch (e) {
			await mysqlConnection[mysqlDbName].rollback();
			
			throw e;
		}
		
		
	};
	
	await updateMongo();
	await updateMysql();
	
	
};

const _getSyncItemBatchResults = function ({syncItem, referenceCollection, ignoreLastUpdateField, fromDate}) {
	const query = {};
	if (syncItem.last_id_checked) {
		query._id = {"$gt": syncItem.last_id_checked};
	}
	else if (ignoreLastUpdateField === false && syncItem.reference_collection_last_update_field && fromDate) {
		query[syncItem.reference_collection_last_update_field] = {$gte: {fromDate}};
	}
	const projection = {
		[syncItem.reference_key]: 1
	};
	syncItem.dependent_fields.forEach(field => {
		projection[field] = 1;
	});
	return referenceCollection.find(query).limit(syncItem.batchSize).project(projection).toArray();
};
const _syncItem = async function ({ignoreLastUpdateField, fromDate}) {
	const syncItem = await synchronizerModel.getNextSyncItem();
	if (!syncItem) {
		return null;
	}
	const db = dbClient.db(syncItem.db_name);
	const referenceCollection = db.collection(syncItem.reference_collection);
	const dependentCollection = db.collection(syncItem.dependent_collection);
	const documents = await _getSyncItemBatchResults({syncItem, referenceCollection, ignoreLastUpdateField, fromDate});
	
	const active = !(documents.length < syncItem.batchSize);
	if (documents.length === 0) {
		synchronizerModel.updateSyncItem(syncItem._id, {active});
		return null;
	}
	
	const result = await _updateSyncItemBatchResults({documents, syncItem, dependentCollection});
	const lastId = documents[documents.length - 1]._id;
	return synchronizerModel.updateSyncItem(syncItem._id, {last_id_checked: lastId, active});
	
};
const _syncItems = async function ({ignoreLastUpdateField, fromDate, retryDelay}) {
	try {
		while (await _syncItem({ignoreLastUpdateField, fromDate})) {
		}
	}
	catch (e) {
		if (retryDelay) {
			setTimeout(() => {
				_syncItems({ignoreLastUpdateField, fromDate, retryDelay}).catch(console.error);
			}, retryDelay);
		}
	}
};

const syncAll = async function ({dbs, batchSize = 500, ignoreLastUpdateField = false, fromDate, cleanOldSyncTasks = false, retryDelay = 0}) {
	
	if (cleanOldSyncTasks === true) {
		await synchronizerModel.cleanSyncDatabase();
	}
	await _createSyncItems(dbs, batchSize);
	await _syncItems({ignoreLastUpdateField, fromDate, retryDelay});
	
};
exports.syncAll = syncAll;
