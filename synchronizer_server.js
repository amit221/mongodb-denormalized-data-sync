require("dotenv").config();
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


http.createServer(app).listen(process.env.PORT || 6500);

const addDependency = async function (req, res, next) {
	await synchronizer.addDependency(req.body);
};
const removeDependency = function (req, res, next) {

};

synchronizer
	.start((process.env.DBS_LIST && process.env.DBS_LIST.split(",")) || [])
	.then(() => {
		app.post("dependency", addDependency);
		app.delete("dependency", removeDependency);
	})
	.catch(err => {
		console.error(err);
		process.exit();
	});


