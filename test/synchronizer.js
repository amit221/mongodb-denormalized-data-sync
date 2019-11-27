const expect = require("chai").expect;
const express = require("express");
const http = require("http");
const app = express();
const bodyParser = require("body-parser");
const mongodb = require("mongodb");
const ObjectId = mongodb.ObjectId;
const mysql = require("promise-mysql");
const program = require("commander");
const {sleep} = require("../utils");
program
	.option("-d, --dbname <dbname>", "the database name for the package.", "mongodb-data-sync-test-db-drop")
	.option("-u, --url <url>", "MongoDB connection url, required")
	.option("--de", "console log important information")
	.option("--mysql <mysql>", "mysql connection")
	.option(" --timeout <time>", "timeout", 5000);


program.parse(process.argv);
process.env.MONGODB_DATA_SYNC_DB = program.dbname;
process.env.MONGODB_URL = program.url;
process.env.DEBUG = program.de;
process.env.MYSQL = program.mysql;
process.env.TRIGGERS_LOOP_INF_INTERVAL = 10;
const dataDb = process.env.MONGODB_DATA_SYNC_DB + "_data";
const synchronizer = require("../synchronizer");
const triggersEngine = require("../triggers");
const synchronizerModel = require("../synchronizer_db");
let mysqlConnection;
let dbClient, db, camp1Id, camp1Id2, userId, userId2, salesId, salesId2;
let updateCounter = 0;
let retryCounter = 0;


app.use(bodyParser.json({limit: "2mb"}));
app.use(bodyParser.urlencoded({
	extended: true,
	limit: "2mb"
}));

http.createServer(app).listen(6667);
app.post("/triggers-test", async (req, res, next) => {
	const obj = await db.collection("triggers_data").findOne({_id: new ObjectId(req.body.documentKey._id)}, {$projection: {_id: 0}});
	if (obj && obj.insert === 2) {
		retryCounter++;
		return res.status(500).send();
	}
	if (req.body.operationType === "insert") {
		await db.collection("triggers_test_post_url").insertOne(obj);
	}
	if (req.body.operationType === "update") {
		await db.collection("triggers_test_post_url").updateOne({_id: obj._id}, {$set: {update_counter: ++updateCounter}});
	}
	if (req.body.operationType === "delete") {
		await db.collection("triggers_test_post_url").deleteOne({_id: new ObjectId(req.body.documentKey._id)});
	}
	res.send({ok: 1});
});


describe("All tests", () => {
	
	after(async function () {
		await sleep(5000);
		await synchronizerModel.closeConnection();
		console.log("exit");
		process.exit();
	});
	
	before(async function () {
		try {
			
			
			dbClient = await synchronizerModel.connect(process.env.MONGODB_URL);
			await synchronizerModel.dropDb();
			await synchronizerModel.createIndexes();
			db = dbClient.db(dataDb);
			await db.collection("campaigns").removeMany();
			await db.collection("orders").removeMany();
			await db.collection("users").removeMany();
			
			camp1Id = await db.collection("campaigns").insertOne({name: "camp 1"}).then(result => result.insertedId);
			camp1Id2 = await db.collection("campaigns").insertOne({name: "camp 2"}).then(result => result.insertedId);
			
			await db.collection("orders").insertOne({
				name: "order 1",
				campaign: {
					_id: camp1Id,
					name: "camp 1"
				}
			});
			await db.collection("orders").insertOne({
				name: "order 2",
				campaign: {
					_id: camp1Id,
					name: "camp 1"
				}
			});
			
			salesId = await db.collection("users").insertOne({
				name: "sales 1",
				
			}).then(result => result.insertedId);
			salesId2 = await db.collection("users").insertOne({
				name: "sales 2",
			}).then(result => result.insertedId);
			userId = await db.collection("users").insertOne({
				name: "user 1",
				sales_agent: {
					_id: salesId,
					name: "sales 1",
				},
				campaign: {
					_id: camp1Id,
					name: "camp 1"
				}
			}).then(result => result.insertedId);
			userId2 = await db.collection("users").insertOne({
				name: "sales 1",
				sales_agent: {
					_id: salesId2,
					name: "sales 2",
				},
				campaign: {
					_id: camp1Id2,
					name: "camp 2"
				}
			}).then(result => result.insertedId);
		}
		catch (e) {
			console.error(e);
			throw e;
		}
	});
	
	before(async function () {
		if (!process.env.MYSQL) {
			return;
		}
		
		const options = JSON.parse(process.env.MYSQL);
		mysqlConnection = await mysql.createConnection({...options, database: "mongo"});
		await mysqlConnection.query("TRUNCATE TABLE `users`");
		await mysqlConnection.query("INSERT INTO `users` SET ? ", {
			user_id: userId,
		});
		await mysqlConnection.query("INSERT INTO `users` SET ? ", {
			user_id: userId2,
		});
		
		
	});
	describe("Triggers", () => {
		
		
		describe("Start", () => {
			it("connect to database and start the triggers loop", async () => {
				await triggersEngine.start();
				
			});
		});
		
		
		describe("Add Trigger", () => {
			let oldId;
			it("adds insert trigger ", async () => {
				try {
					oldId = await triggersEngine.addTrigger({
						dbName: dataDb,
						dependentCollection: "triggers_data",
						triggerType: "insert",
						knowledge: true,
						url: "http://localhost:6667/triggers-test"
					});
					expect(oldId).to.be.an.instanceof(ObjectId);
				} catch (e) {
					console.error(e);
					throw  e;
					
				}
			});
			it("adds update trigger ", async () => {
				try {
					const id = await triggersEngine.addTrigger({
						dbName: dataDb,
						dependentCollection: "triggers_data",
						triggerType: "update",
						triggerFields: ["change", "change2"],
						knowledge: false,
						url: "http://localhost:6667/triggers-test"
					});
					expect(id).to.be.an.instanceof(ObjectId);
				}
				
				catch (e) {
					console.error(e);
					throw  e;
					
				}
			});
			it("adds delete trigger ", async () => {
				try {
					const id = await triggersEngine.addTrigger({
						dbName: dataDb,
						dependentCollection: "triggers_data",
						triggerType: "delete",
						knowledge: false,
						url: "http://localhost:6667/triggers-test"
					});
					expect(id).to.be.an.instanceof(ObjectId);
				}
				catch (e) {
					console.error(e);
					throw  e;
					
				}
			});
			it("check dup error insert trigger ", async () => {
				try {
					const id = await triggersEngine.addTrigger({
						dbName: dataDb,
						dependentCollection: "triggers_data",
						triggerType: "insert",
						knowledge: true,
						url: "http://localhost:6667/triggers-test"
					});
					expect(id).to.be.an.instanceof(ObjectId);
					expect(id.toString()).to.be.equal(oldId.toString());
				} catch (e) {
					console.error(e);
					throw  e;
					
				}
				
				
			});
			
		});
		
		describe("Fire Trigger", () => {
			it("fires an insert trigger", async () => {
				try {
					await db.collection("triggers_data").insertOne({
						insert: 1,
						change2: "change2",
						dont_update_on_trigger: "dont_update_on_trigger",
						change: false
					});
					await db.collection("triggers_data").insertOne({
						insert: 2,
						knowledge: true,
					});
					await sleep(200);
					const result = await db.collection("triggers_test_post_url").findOne({insert: 1, change: false});
					expect(result).to.not.be.null;
					
				} catch (e) {
					console.error(e);
					throw  e;
				}
			});
			it("fires an update trigger", async () => {
				try {
					await db.collection("triggers_data").updateOne({insert: 1}, {$set: {change: true}});
					await sleep(200);
					const result = await db.collection("triggers_test_post_url").findOne({insert: 1});
					expect(result.update_counter).to.be.equal(1);
					
					await db.collection("triggers_data").updateOne({insert: 1}, {$set: {change2: "i have changed"}});
					await sleep(200);
					const result2 = await db.collection("triggers_test_post_url").findOne({insert: 1});
					expect(result2.update_counter).to.be.equal(2);
					await db.collection("triggers_data").updateOne({insert: 1}, {$set: {dont_update_on_trigger: "something"}});
					await sleep(200);
					
					const result3 = await db.collection("triggers_test_post_url").findOne({insert: 1});
					expect(result3.update_counter).to.be.equal(2);
					
					
				} catch (e) {
					console.error(e);
					throw  e;
				}
			});
			it("fires a delete trigger", async () => {
				try {
					await db.collection("triggers_data").deleteOne({
						insert: 1,
					});
					await sleep(200);
					const result = await db.collection("triggers_test_post_url").findOne({insert: 1});
					expect(result).to.be.null;
					
				} catch (e) {
					console.error(e);
					throw  e;
				}
			});
			
			it("checks retries works on knowledge", async () => {
				try {
					await sleep(200);
					
					expect(retryCounter).to.be.greaterThan(1);
					
				} catch (e) {
					console.error(e);
					throw  e;
				}
			});
		});
	});
	
	
	describe("Synchronizer", () => {
		
		
		describe("Start", () => {
			it("connect to database and start the sync loop", async () => {
				await synchronizer.start();
				
			});
		});
		
		describe("Mysql dependency", async () => {
			let id;
			it("on success it need to return an id", async () => {
				id = await synchronizer.addDependency({
					dbName: dataDb,
					refCollection: "users",
					dependentCollection: "mysql.mongo.users",
					foreignField: "_id",
					localField: "user_id",
					fieldsToSync: {
						"campaign_name": "campaign.name",
						"campaign_id": "campaign._id",
						"sales_agent_id": "sales_agent._id",
						"sales_agent_name": "sales_agent.name"
					},
				});
				await synchronizer.addDependency({
					dbName: dataDb,
					refCollection: "campaigns",
					dependentCollection: "users",
					foreignField: "_id",
					localField: "campaign._id",
					fieldsToSync: {"campaign.name": "name"},
				});
				
				expect(id).to.be.an.instanceof(ObjectId);
			});
			
			it("syncs for mysql", async () => {
				
				await synchronizer.syncAll({});
			});
			
			
		});
		
		describe("addDependency", async () => {
			let id;
			it("on success it need to return an id", async () => {
				id = await synchronizer.addDependency({
					dbName: dataDb,
					refCollection: "campaigns",
					dependentCollection: "orders",
					foreignField: "_id",
					localField: "campaign._id",
					fieldsToSync: {"campaign.name": "name"},
				});
				expect(id).to.be.an.instanceof(ObjectId);
			});
			it("should return the old Dependency id ", async () => {
				const oldId = await synchronizer.addDependency({
					dbName: dataDb,
					refCollection: "campaigns",
					dependentCollection: "orders",
					foreignField: "_id",
					localField: "campaign._id",
					fieldsToSync: {"campaign.name": "name"},
				});
				expect(id.toString()).to.be.equal(oldId.toString());
			});
			it("should throw a conflict error ", async () => {
				try {
					await synchronizer.addDependency({
						dbName: dataDb,
						refCollection: "orders",
						dependentCollection: "campaigns",
						foreignField: "_id",
						localField: "campaign._id",
						fieldsToSync: {"campaign.name": "name"},
					});
				}
				catch (e) {
					expect(e.message).to.be.equal("a dependency conflict has accord in field name");
				}
			});
		});
		
		//
		// describe("showDependencies", () => {
		// 	it("checks that the dependency has all the fields correctly", async () => {
		// 		const dependenciesMap = await synchronizer.showDependencies();
		// 		const removeId = (obj) => {
		// 			for (const prop in obj) {
		// 				if (prop === "_id") {
		// 					delete obj[prop];
		// 				} else if (typeof obj[prop] === "object") {
		// 					removeId(obj[prop]);
		// 				}
		// 			}
		// 		};
		// 		removeId(dependenciesMap);
		// 		expect(JSON.stringify(dependenciesMap)).to.be.equal(JSON.stringify({
		// 			"mongodb-data-sync-test-db-drop_data": {
		// 				"campaigns": [{
		// 					"type": "ref",
		// 					"dependent_collection": "orders",
		// 					"dependent_fields": ["name"],
		// 					"fields_format": {"campaign.name": "name"},
		// 					"reference_key": "_id",
		// 					"dependent_key": "campaign._id",
		// 					"reference_collection_last_update_field": null
		// 				}],
		// 				"orders": [{
		// 					"type": "local",
		// 					"fetch_from_collection": "campaigns",
		// 					"local_collection": "orders",
		// 					"fields_format": {"campaign.name": "name"},
		// 					"fetch_from_key": "_id",
		// 					"local_key": "campaign._id"
		// 				}]
		// 			}
		// 		}));
		// 	});
		// });
		//
		
		describe("change loop ", () => {
			it("checks 1 to 1 dependency", async () => {
				const result = await db.collection("campaigns").updateOne({name: "camp 1"}, {$set: {name: "camp 1 changed"}});
				await sleep(1000);
				const order = await db.collection("orders").findOne({name: "order 1"});
				
				expect(order.campaign.name).to.be.equal("camp 1 changed");
			});
			it("checks 1 to many dependency", async () => {
				await db.collection("campaigns").updateOne({name: "camp 1"}, {$set: {name: "camp 1 changed"}});
				await sleep(500);
				const orders = await db.collection("orders").find({"campaign.name": "camp 1 changed"}).toArray();
				
				
				expect(orders.length).to.be.equal(2);
			});
			
			it("checks local dependency change", async () => {
				await db.collection("orders").updateOne({name: "order 1"}, {$set: {"campaign._id": camp1Id2}});
				await sleep(500);
				const orders = await db.collection("orders").findOne({"campaign._id": camp1Id2});
				
				expect(orders.campaign.name).to.be.equal("camp 2");
			});
		});
		
		describe("sync", () => {
			it("checks sync old data", async () => {
				await synchronizer.pause();
				await db.collection("orders").updateOne({name: "order 1"}, {$set: {"campaign._id": camp1Id}});
				await db.collection("orders").updateOne({name: "order 2"}, {$set: {"campaign._id": camp1Id2}});
				let orders = await db.collection("orders").findOne({name: "order 1"});
				expect(orders.campaign.name).to.be.equal("camp 2");
				await synchronizer.syncAll({cleanOldSyncTasks: true});
				orders = await db.collection("orders").findOne({name: "order 1"});
				expect(orders.campaign.name).to.be.equal("camp 1 changed");
				await synchronizer.continue();
			});
		});
		
		
	});
	
	
});