const debug = function () {
	if (process.env.DEBUG !== "true") {
		return;
	}
	console.log.apply(null, [...arguments]);
};
exports.debug = debug;

exports.DUPLICATE_CODE_ERROR = 11000;
exports.RESUME_TOKEN_ERROR = 40585;
