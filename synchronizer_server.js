#!/usr/bin/env node

const program = require("commander");
const {debug} = require("./utils");
const morgan = require("morgan");

program
	.option("--debug", "console log important information")
	.option("-p, --port <port>", "server port.", 6500)
	.option("-d, --dbname <dbname>", "the database name for the package.", "mongodb_data_sync_db")
	.option("-k, --key <key>", "api key to used for authentication of the sdk requests, required ")
	.option("--mysql <mysql>", "mysql connection")
	.option("-u, --url <url>", "MongoDB connection url, required");


program.parse(process.argv);
process.env.PORT = program.port;
process.env.MONGODB_DATA_SYNC_DB = program.dbname;
process.env.API_KEY = program.key;
process.env.MONGODB_URL = program.url;
process.env.DEBUG = program.debug;
process.env.MYSQL = program.mysql;
let format = "dev";

if (process.env.debug) {
	morgan.token("body-str", function getBody(req) {
		if (!req.body) {
			return "";
		}
		return JSON.stringify(req.body);
	});
	morgan.token("ip", function getIp(req) {
		const ip = req.headers["cf-connecting-ip"] ||
			req.headers["x-forwarded-for"] ||
			req.connection.remoteAddress ||
			req.socket.remoteAddress ||
			req.connection.socket.remoteAddress;
		return ip;
	});
	
	
	format = (tokens, req, res) => {
		return JSON.stringify({
			"method": tokens["method"](req, res),
			"url": tokens["url"](req, res),
			"status": tokens["status"](req, res),
			"content-length": tokens["res"](req, res, "content-length"),
			"response-time": tokens["response-time"](req, res),
			"referrer": tokens["referrer"](req, res),
			"ip": tokens["ip"](req, res),
			"body-str": tokens["body-str"](req, res),
		});
	};
	
}
debug("commend line arguments:\n", program.opts());

if (!program.key) {
	throw new Error("key is required");
}
if (!program.url) {
	throw new Error("url is required");
}

const http = require("http");
const synchronizer = require("./synchronizer");
const express = require("express");
const helmet = require("helmet");
const bodyParser = require("body-parser");
const methodOverride = require("method-override");

const app = express();
app.use(morgan(format));
app.use(bodyParser.json({limit: "2mb"}));
app.use(bodyParser.urlencoded({
	extended: true,
	limit: "2mb"
}));
app.use(methodOverride());
app.use(helmet());


const addDependency = async function (req, res) {
	try {
		const id = await synchronizer.addDependency(req.body);
		res.send(id);
	} catch (e) {
		console.error(e);
		res.status(500).send(e.message);
	}
	
};
const removeDependency = async function (req, res) {
	try {
		if (!req.params.id) {
			return res.status(500).send("id is required");
		}
		await synchronizer.removeDependency(req.params.id);
		res.send("ok");
	} catch (e) {
		console.error(e);
		res.status(500).send(e.message);
	}
};
const getDependencies = async function (req, res) {
	try {
		const result = await synchronizer.showDependencies();
		res.send(result);
	} catch (e) {
		console.error(e);
		res.status(500).send(e.message);
	}
};
const sync = async function (req, res) {
	try {
		const result = await synchronizer.syncAll(req.body);
		res.send(result);
	} catch (e) {
		console.error(e);
		res.status(500).send(e.message);
	}
};
const auth = function (req, res, next) {
	if (req.query.api_key !== process.env.API_KEY) {
		return res.status(401).send("unauthorized");
	}
	next();
};

app.get("/dependencies", auth, getDependencies);
app.post("/dependencies", auth, addDependency);
app.post("/sync", auth, sync);
app.delete("/dependencies", auth, removeDependency);

synchronizer
	.start()
	.then(() => {
	
	})
	.catch(err => {
		console.error(err);
		process.exit();
	});


http.createServer(app).listen(process.env.PORT);
console.log(`mongodb-data-sync server is running on port ${process.env.PORT}`);
