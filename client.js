let _dbName;
let _serviceUrl;


exports.init = function ({dbName, serviceUrl}) {
	_dbName = dbName;
	_serviceUrl = serviceUrl;
	if (!dbName || !serviceUrl) {
		throw new Error("dbName or serviceUrl where not set correctly");
	}
};

exports.addDependency = function ({dependentCollection, refCollection, localField, fieldsToSync = {}, foreignField = "_id",}) {
	const dependency = _addDependency({dependentCollection, refCollection, localField, fieldsToSync, foreignField});
};

exports.batchDependencies = function (dependencies) {

};


const _addDependency = function ({dependentCollection, refCollection, localField, fieldsToSync = {}, foreignField = "_id"}) {
	
	if (!_dbName || !_serviceUrl) {
		throw new Error("dbName or serviceUrl where not set correctly");
	}
	if (!dependentCollection) {
		throw new Error("dependentCollection is required");
	}
	if (!refCollection) {
		throw new Error("refCollection is required");
	}
	if (!localField) {
		throw new Error("localField is required");
	}
	if (!fieldsToSync || Object.keys(fieldsToSync).length === 0) {
		throw new Error("fieldsToSync needs to has at least 1 field needed to be synced");
	}
	
	return {
		dependentCollection,
		refCollection,
		localField,
		foreignField,
		fieldsToSync
	};
};
