const Joi = require("@hapi/joi");
const {MongoClient, ObjectId} = require("mongodb");

let client, db, dependenciesCollection, resumeTokenCollection, syncCollection;

const dependenciesSchema = {
	db_name: Joi.string().required(),
	reference_collection: Joi.string().required(),
	dependent_collection: Joi.string().required(),
	dependent_fields: Joi.array().items(Joi.string()).required(),
	fields_format: Joi.object().required(),
	reference_key: Joi.string().required(),
	dependent_key: Joi.string().required()
};

const syncSchema = {
	...dependenciesSchema,
	batchSize: Joi.number().required(),
	last_id_checked: Joi.string().allow(null).default(null),
	active: Joi.boolean().default(true)
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
	syncCollection = db.collection("sync");
	return client;
};

exports.validate = function (payload) {
	return Joi.validate(payload, dependenciesSchema, {abortEarly: false});
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

exports.addResumeToken = function (payload) {
	payload.last_update = new Date();
	return resumeTokenCollection.updateOne({}, {$set: payload}, {upsert: true});
};

exports.getResumeToken = function () {
	return resumeTokenCollection.findOne();
};
exports.addSyncItem = function (payload) {
	return syncCollection.insertOne(payload);
};
exports.updateSyncItem = function (id, payload) {
	return syncCollection.updateOne({id: new ObjectId(id)}, {$set: payload});
};
exports.removeSyncItem = function (id) {
	return syncCollection.deleteOne({_id: new ObjectId(id)});
};

exports.getNextSyncItem = function () {
	return syncCollection.findOne({active: true});
};

exports.cleanSyncDatabase = function () {
	return syncCollection.removeMany();
};

process.stdin.resume();
const exitHandler = async (options) => {
	if (client) {
		await client.close().catch(console.error);
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