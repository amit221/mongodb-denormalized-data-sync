const synchronizerModel = require("./synchronizer_db");
const {debug, RESUME_TOKEN_ERROR, CHANGE_STREAM_FATAL_ERROR} = require("./utils");
const axios = require("axios");
let changeStream, dbClient;
let triggersMap = {};
let triggersQueueInfLoopInterval;

exports.start = async function (db) {
	dbClient = db || synchronizerModel.getDbClient();
	await _buildTriggersMap();
	await initChangeStream();
	_triggersQueueInfLoop();
};

const _triggersQueueInfLoop = async () => {
	clearInterval(triggersQueueInfLoopInterval);

	try {
		const triggers = await synchronizerModel.getTriggersQueue();
		for (let i in triggers) {
			const trigger = triggers[i];
			axios.post(trigger.url, trigger.fields)
				.then(() => synchronizerModel.removeTriggerFromQueue(trigger._id))
				.catch(response => _failedTrigger(trigger, trigger.fields, response));
		}
	} catch (e) {
		console.error(e);
	}

	triggersQueueInfLoopInterval = setTimeout(() => {
		_triggersQueueInfLoop();
	}, process.env.TRIGGERS_LOOP_INF_INTERVAL || 1000 * 60 * 3);
};


const initChangeStream = async function () {
	if (changeStream) {
		await changeStream.close();
	}
	const oldResumeTokenDoc = await synchronizerModel.getResumeToken("trigger");
	const resumeAfter = oldResumeTokenDoc ? oldResumeTokenDoc.token : undefined;
	let pipeline = _buildPipeline();
	console.dir("pipline1", pipeline);

	if (pipeline[0].$match.$or.length === 0) {
		return;
	}
	console.dir("pipline2", pipeline);
	console.dir("pipline2", resumeAfter);

	changeStream = dbClient.watch(pipeline, {resumeAfter});
	changeStream.on("change", next => {
		console.log("hhhhhhhhhhhhhhhhhh")
		_changeStreamLoop(next);
	});
	changeStream.on("error", async err => {
		console.error(err)
		if (await _removeResumeTokenAndInit(err) === true) {
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
		if (Array.isArray(trigger.trigger_fields)) {
			trigger.trigger_fields_set = new Set(trigger.trigger_fields);
		}
		triggersMap[trigger.db_name][trigger.dependent_collection].push(trigger);
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
			result = await synchronizerModel.getTriggerIdByAllFields(value);
			return result._id;
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
	if (err.code === RESUME_TOKEN_ERROR || err.code === CHANGE_STREAM_FATAL_ERROR) {
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
			$or.push({"ns.db": dbName, "ns.coll": collName, operationType: {$in: [...operations]}});
		});
	});

	const project = {documentKey: 1, updateDescription: 1, operationType: 1, ns: 1};

	pipeline.push({
		$project: project
	});
	return pipeline;
};

const _fireTriggers = function ({ns, documentKey, operationType, updateDescription}) {
	console.log("{ns, documentKey, operationType, updateDescription}", {
		ns,
		documentKey,
		operationType,
		updateDescription
	});
	console.log(triggersMap);
	if (!triggersMap[ns.db] || !triggersMap[ns.db][ns.coll]) {
		return;
	}
	for (let i in triggersMap[ns.db][ns.coll]) {

		if (triggersMap[ns.db][ns.coll][i].trigger_type !== operationType) {
			continue;
		}

		if (triggersMap[ns.db][ns.coll][i].trigger_type === "update") {
			_triggerUpdateOperation(triggersMap[ns.db][ns.coll][i], documentKey, updateDescription);
			continue;
		}

		triggerDeleteInsertReplaceOperation(triggersMap[ns.db][ns.coll][i], documentKey, operationType);

	}
};

const _triggerUpdateOperation = function (trigger, documentKey, updateDescription) {
	const fields = {...updateDescription.updatedFields};
	let needToTrigger = false;
	for (const field in updateDescription.updatedFields) {
		if (trigger.trigger_fields_set.has(field)) {
			needToTrigger = true;
		}
	}
	console.log(trigger, fields);
	if (needToTrigger) {
		console.log("fireeee");
		fields.documentKey = documentKey;
		fields.operationType = "update";
		axios.post(trigger.url, fields).catch(response => _failedTrigger(trigger, fields, response));
	}
};
const _failedTrigger = (trigger, fields, response) => {
	if (trigger.knowledge === true && (!response || response.response.status !== 404)) {
		synchronizerModel.enqueueTrigger(trigger.url, fields);
	}
};

const triggerDeleteInsertReplaceOperation = function (trigger, documentKey, operationType) {
	const fields = {documentKey, operationType};
	axios.post(trigger.url, fields).catch(response => _failedTrigger(trigger, fields, response));
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

