const _synchronizerClientInstances = {};
const axios = require('axios');
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
	
	constructor(dbName, serviceUrl, apiKey) {
		if (!dbName || !serviceUrl || !apiKey) {
			throw new Error("dbName,serviceUrl and apiKey are required");
		}
		this.dbName = dbName;
		this.serviceUrl = serviceUrl;
		this.apiKey = apiKey;
	}
	
	async addDependency({dependentCollection, refCollection, localField, fieldsToSync = {}, foreignField = "_id"}) {
		
		const dependency = _validateDependency({
			dependentCollection,
			refCollection,
			localField,
			fieldsToSync,
			foreignField,
		});
		
		return axios.post(this.serviceUrl + "/dependencies?api_key=" + this.apiKey, dependency);
	};
	
	removeDependency(id) {
		return axios.delete(this.serviceUrl + "/dependencies/" + id + "?api_key=" + this.apiKey);
	};
	
	getDependencies() {
		return axios.get(this.serviceUrl + "/dependencies?api_key=" + this.apiKey);
	};
}

const init = function ({dbName, serviceUrl, apiKey}) {
	if (_synchronizerClientInstances[dbName]) {
		return getInstance(dbName);
	}
	_synchronizerClientInstances[dbName] = new SynchronizerClient(dbName, serviceUrl, apiKey);
	return getInstance(dbName);
};

const getInstance = function ({dbName}) {
	return _synchronizerClientInstances[dbName];
};


exports = {init, getInstance};


