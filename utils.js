const debug = function () {
	if (process.env.DEBUG !== "true") {
		return;
	}
	console.log.apply(null, [...arguments]);
};
exports.debug = debug;