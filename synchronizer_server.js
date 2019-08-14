require("dotenv").config();
process.env.PORT = process.env.PORT || 6500;
process.env.MONGODB_DATA_SYNC_DB = process.env.MONGODB_DATA_SYNC_DB || "mongodb_data_sync_db";
if (!process.env.API_KEY) {
	throw new Error("process.env.API_KEY is required");
}
const http = require("http");
const synchronizer = require('./synchronizer');
const express = require("express");
const morgan = require("morgan");
const helmet = require("helmet");
const bodyParser = require("body-parser");
const methodOverride = require("method-override");

const app = express();

app.use(morgan);
app.use(bodyParser.json({limit: "2mb"}));
app.use(bodyParser.urlencoded({
	extended: true,
	limit: "2mb"
}));
app.use(methodOverride());
app.use(helmet());


http.createServer(app).listen(process.env.PORT);

const addDependency = async function (req, res, next) {
	try {
		const id = await synchronizer.addDependency(req.body);
		res.send(id);
	}
	catch (e) {
		res.status(500).send(e);
	}
	
};
const removeDependency = async function (req, res, next) {
	try {
		if (!req.params.id) {
			return res.status(500).send("id is required");
		}
		await synchronizer.removeDependency(req.params.id);
		res.send("ok");
	}
	catch (e) {
		res.status(500).send(e);
	}
};
const getDependencies = async function (req, res, next) {
	try {
		const result = await synchronizer.showDependencies();
		res.send(result);
	}
	catch (e) {
		res.status(500).send(e);
	}
};

const auth = function (req, res, next) {
	if (req.query.api_key !== process.env.API_KEY) {
		return res.status(401, 'unauthorized');
	}
	next();
};
synchronizer
	.start()
	.then(() => {
		app.get("/dependencies", auth, getDependencies);
		app.post("/dependencies", auth, addDependency);
		app.delete("/dependencies", auth, removeDependency);
	})
	.catch(err => {
		console.error(err);
		process.exit();
	});


