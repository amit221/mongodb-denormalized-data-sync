const synchronizerModel = require("./synchronizer_db");
const {debug, getObjectPropFromString, DUPLICATE_CODE_ERROR, RESUME_TOKEN_ERROR} = require("./utils");
const axios = require("axios");
let changeStream, dbClient;
let triggersMap = {};


exports.start = async function () {
	await _buildTriggersMap();
	await initChangeStream();
};


setInterval(() => {
	synchronizerModel.getTriggersQueue()
		.then(async triggers => {
			for (let i in triggers) {
				const trigger = triggers[i];
				await axios.post(trigger.url, trigger.fields).then(() => synchronizerModel.removeTriggerFromQueue(trigger._id));
			}
			
		});
}, 1000 * 60 * 3);

const initChangeStream = async function () {
	if (changeStream) {
		await changeStream.close();
	}
	const oldResumeTokenDoc = await synchronizerModel.getResumeToken("trigger");
	const resumeAfter = oldResumeTokenDoc ? oldResumeTokenDoc.token : undefined;
	let pipeline = _buildPipeline();
	if (pipeline[0].$match.$or.length === 0) {
		return;
	}
	
	changeStream = dbClient.watch(pipeline, {resumeAfter});
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

exports.initChangeStream = initChangeStream;

const _buildTriggersMap = async function () {
	synchronizerModel.getTriggers();
	const triggers = await synchronizerModel.getTriggers();
	triggersMap = {};
	triggers.forEach(trigger => {
		
		triggersMap[trigger.db_name] = triggersMap[trigger.db_name] || {};
		triggersMap[trigger.db_name][trigger.dependent_collection] = triggersMap[trigger.db_name][trigger.dependent_collection] || [];
		
		triggersMap[trigger.db_name][trigger.dependent_collection].push({
			[trigger.trigger_type]: new Set(trigger.trigger_fields),
			knowledge: trigger.knowledge
		});
	});
};


exports.addTrigger = async function (body) {
	let result;
	const payload = {
		db_name: body.dbName,
		dependent_collection: body.dependentCollection,
		trigger_type: body.triggerType,
		trigger_fields: body.triggerFields,
		knowledge: body.knowledge,
		url: body.url
	};
	
	const {error, value} = synchronizerModel.validateTrigger(payload);
	
	if (error) {
		throw new Error(error);
	}
	try {
		result = await synchronizerModel.addTrigger(value);
		
		
	} catch (e) {
		if (e.code === 11000) { // duplicate key error
			return "new";
		}
		throw e;
	}
	await _buildTriggersMap();
	await initChangeStream();
	
	return result.insertedId;
	
};
exports.removeTrigger = async function (id) {
	const result = await synchronizerModel.removeTrigger(id);
	if (result.n > 0) {
		await _buildTriggersMap();
		await initChangeStream();
	}
};

const _removeResumeTokenAndInit = async function (err) {
	if (err.code === RESUME_TOKEN_ERROR) {
		changeStream = undefined;
		await synchronizerModel.removeResumeToken("trigger");
		await initChangeStream();
		return false;
	}
	return true;
};
const _buildPipeline = function () {
	const $or = [];
	const $match = {operationType: {$in: ["update", "insert", "delete", "replace"]}, $or};
	const pipeline = [
		{$match}
	];
	
	Object.keys(triggersMap).forEach(dbName => {
		Object.keys(triggersMap[dbName]).forEach(collName => {
			const operations = new Set();
			triggersMap[dbName][collName].forEach(trigger => {
				operations.add(trigger.trigger_type);
			});
			$or.push({"ns.db": dbName, "ns.coll": collName, operationType: {$in: operations}});
		});
	});
	
	const project = {documentKey: 1, updateDescription: 1, fullDocument: 1, ns: 1};
	
	pipeline.push({
		$project: project
	});
	return pipeline;
};

const _fireTriggers = function ({ns, documentKey, operationType, updateDescription, fullDocument}) {
	if (!triggersMap[ns.db] ||
		!triggersMap[ns.db][ns.coll]
	) {
		return;
	}
	
	for (let i in triggersMap[ns.db][ns.coll]) {
		if (!triggersMap[ns.db][ns.coll][i][operationType]) {
			continue;
		}
		if (triggersMap[ns.db][ns.coll][i][operationType] === "update") {
			_triggerUpdateOperation(triggersMap[ns.db][ns.coll][i][operationType], documentKey, updateDescription);
			continue;
		}
		triggerDeleteInsertReplaceOperation(triggersMap[ns.db][ns.coll][i][operationType]);
		
	}
};

const _triggerUpdateOperation = function (trigger, documentKey, updateDescription) {
	const fields = {};
	let needToTrigger = false;
	for (const field in updateDescription) {
		if (trigger.trigger_fields.has(field)) {
			fields[field] = updateDescription[field];
			needToTrigger = true;
		}
	}
	
	if (needToTrigger) {
		fields.documentKey = documentKey;
		axios.post(trigger.url, fields).catch(response => {
			if (trigger.knowledge === true && (!response || response.status !== 404)) {
				synchronizerModel.enqueueTrigger(trigger.url, fields);
			}
		});
	}
};
const triggerDeleteInsertReplaceOperation = function (trigger, documentKey) {
	const fields = {documentKey};
	axios.post(trigger.url, fields).catch(response => {
		if (trigger.knowledge === true && (!response || response.status !== 404)) {
			synchronizerModel.enqueueTrigger(trigger.url, fields);
		}
	});
};

const _changeStreamLoop = async function (next) {
	
	
	if (!next || !next._id) {
		return;
	}
	try {
		await synchronizerModel.addResumeToken({token: next._id}, "trigger");
		await _fireTriggers(next);
		
	} catch (e) {
		console.error(e);
	}
	
	
};

