const Joi = require("@hapi/joi");
const {MongoClient, ObjectId} = require("mongodb");

let client, db, dependenciesCollection, resumeTokenCollection, syncCollection, triggersCollection,
	triggersQueueCollection;

const dependenciesSchema = {
	db_name: Joi.string().required(),
	reference_collection: Joi.string().required(),
	dependent_collection: Joi.string().required(),
	dependent_fields: Joi.array().items(Joi.string()).required(),
	fields_format: Joi.object().required(),
	reference_key: Joi.string().required(),
	dependent_key: Joi.string().required(),
	reference_collection_last_update_field: Joi.string()
};

const syncSchema = {
	...dependenciesSchema,
	batchSize: Joi.number().required(),
	last_id_checked: Joi.string().allow(null).default(null),
	active: Joi.boolean().default(true)
};
const triggerSchema = {
	db_name: Joi.string().required(),
	dependent_collection: Joi.string().required(),
	trigger_type: Joi.string().allow(["insert", "update", "replace", "delete"]).required(),
	trigger_fields: Joi.array().min(1).required(),
	url: Joi.string().required(),
	knowledge: Joi.boolean().default(false)
};

exports.connect = async function (connectionString, connectionOptions = {}) {
	if (typeof connectionOptions === "string") {
		connectionOptions = JSON.parse(connectionOptions);
	}
	connectionOptions.useNewUrlParser = true;
	client = await MongoClient.connect(connectionString, connectionOptions);
	db = client.db(process.env.MONGODB_DATA_SYNC_DB);
	dependenciesCollection = db.collection("dependencies");
	await dependenciesCollection.createIndex({
		db_name: 1,
		reference_collection: 1,
		dependent_collection: 1,
		dependent_key: 1,
	}, {unique: true});
	resumeTokenCollection = db.collection("resume_token");
	triggersCollection = db.collection("triggers");
	await dependenciesCollection.createIndex({
		db_name: 1,
		dependent_collection: 1,
		trigger_type: 1, trigger_fields: 1, knowledge: 1
	}, {unique: true});
	triggersQueueCollection = db.collection("triggersQueue");
	syncCollection = db.collection("sync");
	return client;
};

exports.enqueueTrigger = function (url, fields) {
	return triggersCollection.insertOne({
		url,
		fields
	});
};
exports.getTriggersQueue = () => {
	return triggersQueueCollection.find();
};
exports.removeTriggerFromQueue = (id) => {
	return triggersQueueCollection.removeOne({_id: new ObjectId(id)});
	
};

exports.validate = function (payload) {
	return Joi.validate(payload, dependenciesSchema, {abortEarly: false});
};

exports.validateTrigger = function (payload) {
	return Joi.validate(payload, triggerSchema, {abortEarly: false});
};
exports.validateSync = function (payload) {
	return Joi.validate(payload, syncSchema, {abortEarly: false});
};
exports.removeDependency = function (id) {
	return dependenciesCollection.deleteOne({_id: new ObjectId(id)});
};

exports.addDependency = function (payload) {
	return dependenciesCollection.insertOne(payload);
};
exports.getDependencies = function () {
	return dependenciesCollection.find().toArray();
};

exports.getTriggers = function () {
	return triggersCollection.find().toArray();
};
exports.addTrigger = function (payload) {
	return triggersCollection.insertOne(payload);
	
};
exports.removeTrigger = function (id) {
	return triggersCollection.deleteOne({_id: new ObjectId(id)});
	
};

exports.addResumeToken = function (payload, type) {
	payload.last_update = new Date();
	return resumeTokenCollection.updateOne({type}, {$set: payload}, {upsert: true});
};

exports.removeResumeToken = function (type) {
	return resumeTokenCollection.deleteMany({type});
};

exports.getResumeToken = function (type) {
	return resumeTokenCollection.findOne({type});
};
exports.addSyncItem = function (payload) {
	payload.fields_format = JSON.stringify(payload.fields_format);
	return syncCollection.insertOne(payload);
};
exports.updateSyncItem = function (id, payload) {
	return syncCollection.updateOne({_id: new ObjectId(id)}, {$set: payload});
};

exports.getNextSyncItem = function () {
	return syncCollection.findOne({active: true}).then(result => {
		if (result) {
			result.fields_format = JSON.parse(result.fields_format);
		}
		return result;
	});
};

exports.cleanSyncDatabase = function () {
	return syncCollection.removeMany();
};
exports.closeConnection = async function () {
	if (client) {
		return client.close().catch(console.error);
	}
};

exports.dropDb = function () {
	return db.dropDatabase();
};
