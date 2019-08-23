const _synchronizerClientInstances = {};
const axios = require("axios");
const _validateDependency = function ({dependentCollection, refCollection, localField, fieldsToSync = {}, foreignField = "_id"}) {
	
	
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

class SynchronizerClient {
	
	constructor(dbName, engineUrl, apiKey) {
		if (!dbName || !engineUrl || !apiKey) {
			throw new Error("dbName,engineUrl and apiKey are required");
		}
		this.dbName = dbName;
		this.engineUrl = engineUrl;
		this.apiKey = apiKey;
	}
	
	async addDependency({dependentCollection, refCollection, localField, fieldsToSync = {}, foreignField = "_id", refCollectionLastUpdateField}) {
		
		const dependency = _validateDependency({
			dependentCollection,
			refCollection,
			localField,
			fieldsToSync,
			foreignField,
			refCollectionLastUpdateField
		});
		dependency.dbName = this.dbName;
		return axios.post(this.engineUrl + "/dependencies?api_key=" + this.apiKey, dependency).then(response => response.data);
		;
	}
	
	removeDependency(id) {
		return axios.delete(this.engineUrl + "/dependencies/" + id + "?api_key=" + this.apiKey);
	}
	
	getDependencies() {
		return axios.get(this.engineUrl + "/dependencies?api_key=" + this.apiKey).then(response => response.data);
	}
	//todo
	sync({batchSize = 500, ignoreLastUpdateField = false, fromDate, cleanOldSyncTasks = false, retryDelay = 0}) {
		return axios.post(this.engineUrl + "/sync?api_key=" + this.apiKey, {dbs: [this.dbName]}).then(response => response.data);
	}
}

const init = function ({dbName, engineUrl, apiKey}) {
	if (_synchronizerClientInstances[dbName]) {
		return getInstance(dbName);
	}
	_synchronizerClientInstances[dbName] = new SynchronizerClient(dbName, engineUrl, apiKey);
	return getInstance(dbName);
};

const getInstance = function ({dbName}) {
	return _synchronizerClientInstances[dbName];
};

module.exports = {init, getInstance};


