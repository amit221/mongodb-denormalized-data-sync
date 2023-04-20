const debug = function () {
	if (process.env.DEBUG !== "true") {
		return;
	}
	console.log.apply(null, [...arguments]);
};
exports.debug = debug;


const sleep = (time) => {
	return new Promise(resolve => {
		setTimeout(() => {
			resolve();
		}, time);
	});
};
exports.sleep = sleep;

const getObjectPropFromString = (obj, propString, delimiter = ".") => {
	let result = obj;
	const arr = propString.split(delimiter);
	for (let i in arr) {
		if (result[arr[i]] === undefined) {
			return undefined;
		}
		result = result[arr[i]];

	}

	return result;
};

exports.getObjectPropFromString = getObjectPropFromString;


exports.DUPLICATE_CODE_ERROR = 11000;
exports.RESUME_TOKEN_ERROR = 40585;
exports.CHANGE_STREAM_FATAL_ERROR = 280;
exports.CHANGE_STREAM_HISTORY_LOST_ERROR = 286;
exports.CHANGE_STREAM_INVALIDATED_ERROR = 346;
exports.CHANGE_STREAM_TEPOLOGEY_CHANGE_ERROR = 348;
exports.CHANGE_STREAM_START_AFTER_INVALIDATE_ERROR = 348;

exports.changeStreamErrors = [
	this.RESUME_TOKEN_ERROR,
	this.CHANGE_STREAM_FATAL_ERROR,
	this.CHANGE_STREAM_HISTORY_LOST_ERROR,
	this.CHANGE_STREAM_INVALIDATED_ERROR,
	this.CHANGE_STREAM_TEPOLOGEY_CHANGE_ERROR,
	this.CHANGE_STREAM_START_AFTER_INVALIDATE_ERROR
];

