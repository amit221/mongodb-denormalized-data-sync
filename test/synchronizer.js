const expect = require("chai").expect;
const mongodb = require("mongodb");
const ObjectId = mongodb.ObjectId;
const program = require("commander");

program
	.option("-d, --dbname <dbname>", "the database name for the package.", "mongodb-data-sync-test-db-drop")
	.option("-u, --url <url>", "MongoDB connection url, required")
	.option(" --timeout <time>", "timeout", 5000)
	.option(" --watch ");


program.parse(process.argv);
process.env.MONGODB_DATA_SYNC_DB = program.dbname;
process.env.MONGODB_URL = program.url;
const dataDb = process.env.MONGODB_DATA_SYNC_DB + "_data";
const synchronizer = require("../synchronizer");
const synchronizerModel = require("../synchronizer_db");


describe("synchronizer", () => {
	before(async function () {
		const dbClient = await synchronizerModel.connect(process.env.MONGODB_URL);
		synchronizerModel.dropDb();
		const db = dbClient.db(dataDb);
		const camp1Id = await db.collection("campaigns").insertOne({name: "camp 1"}).then(result => result.insertedId);
		await db.collection("orders").insertOne({
			name: "order 1",
			campaign: {
				_id: camp1Id,
				name: "camp 1"
			}
			
		});
		await synchronizerModel.closeConnection();
	});
	
	describe("start", () => {
		it("connect to database and start the sync loop", async () => {
			await synchronizer.start();
		});
	});
	
	
	describe("addDependency", () => {
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
	
	describe("showDependencies", () => {
		it("checks that the dependency has all the fields correctly", async () => {
			const dependenciesMap = await synchronizer.showDependencies();
			const removeId = (obj) => {
				for (const prop in obj) {
					if (prop === "_id") {
						delete obj[prop];
					} else if (typeof obj[prop] === "object") {
						removeId(obj[prop]);
					}
				}
			};
			removeId(dependenciesMap);
			expect(JSON.stringify(dependenciesMap)).to.be.equal(JSON.stringify({
				"mongodb-data-sync-test-db-drop_data": {
					"campaigns": [{
						"type": "ref",
						"dependent_collection": "orders",
						"dependent_fields": ["name"],
						"fields_format": {"campaign.name": "name"},
						"reference_key": "_id",
						"dependent_key": "campaign._id",
						"reference_collection_last_update_field": null
					}],
					"orders": [{
						"type": "local",
						"fetch_from_collection": "campaigns",
						"local_collection": "orders",
						"fields_format": {"campaign.name": "name"},
						"fetch_from_key": "_id",
						"local_key": "campaign._id"
					}]
				}
			}));
		});
	});
});