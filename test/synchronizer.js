const expect = require("chai").expect;
const mongodb = require("mongodb");

const program = require("commander");

program
	.option("-d, --dbname <dbname>", "the database name for the package.", "mongodb-data-sync-test-db-drop")
	.option("-u, --url <url>", "MongoDB connection url, required")
	.option(" --timeout <time>", "timeout", 5000)
	.option(" --watch ");


program.parse(process.argv);
process.env.MONGODB_DATA_SYNC_DB = program.dbname;
process.env.MONGODB_URL = program.url;
const synchronizer = require("../synchronizer");


describe("synchronizer", () => {
	describe("start", () => {
		it("connect to database and start the sync loop", async () => {
			await synchronizer.start();
		});
	});
});
// describe("addDependency", () => {
// 	it("need t", () => {
//
// 	});
// });