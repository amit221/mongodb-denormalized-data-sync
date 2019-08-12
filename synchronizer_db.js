const Joi = require("@hapi/joi");
const {MongoClient, ObjectId} = require("mongodb");
const mongodbDenormalizedDataSyncDbName = "mongodb_denormalized_data_sync_db";

let client, db, dependenciesCollection, resumeTokenCollection;

const schema = {
	db_name: Joi.string().required(),
	reference_collection: Joi.string().required(),
	dependent_collection: Joi.string().required(),
	dependent_fields: Joi.object().required(),
	fields_format: Joi.object().required(),
	reference_key: Joi.string().required(),
	dependent_key: Joi.string().required()
};

exports.connect = async function (connectionString, connectionOptions = {}) {
	if (typeof connectionOptions === 'string') {
		connectionOptions = JSON.parse(connectionOptions);
	}
	connectionOptions.useNewUrlParser = true;
	client = await MongoClient.connect(connectionString, connectionOptions);
	db = client.db(mongodbDenormalizedDataSyncDbName);
	dependenciesCollection = db.collection('dependencies');
	await dependenciesCollection.createIndex({
		db_name: 1,
		reference_collection: 1,
		dependent_collection: 1
	}, {unique: true});
	resumeTokenCollection = db.collection('resume_token');
	
	return client;
};

exports.validate = function (payload) {
	return Joi.validate(payload, schema, {abortEarly: false});
};

exports.addDependency = function (payload) {
	const query = {};
	if (id !== "new") {
		query._id = new ObjectId;
	}
	return dependenciesCollection.updateOne(payload, {upsert: true});
};
exports.getDependencies = function () {
	return dependenciesCollection.find().toArray();
};

exports.addResumeToken = function (payload) {
	return resumeTokenCollection.updateOne({}, {$set: payload}, {upsert: true});
};

exports.getResumeToken = function () {
	return resumeTokenCollection.findOne();
};


process.stdin.resume();//so the program will not close instantly
const exitHandler = async (options) => {
	if (client) {
		await client.close().catch(console.error);
	}
	if (options.exit === true) {
		process.exit();
		
	}
};

process.on('exit', exitHandler.bind(null, {}));
process.on('SIGTERM', exitHandler.bind(null, {exit: true}));
process.on('SIGINT', exitHandler.bind(null, {exit: true}));
process.on('SIGUSR1', exitHandler.bind(null, {exit: true}));
process.on('SIGUSR2', exitHandler.bind(null, {exit: true}));