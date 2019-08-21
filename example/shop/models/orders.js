const SynchronizerClient = process.env.NODE_ENV === "dev" ? require("../../../synchronizer_client") : require("mongodb-data-sync");
const mongoose = require("mongoose");
const ObjectId = mongoose.ObjectId;

const synchronizerClientInstance = SynchronizerClient.getInstance({dbName: process.env.MONGODB_DB_NAME});

synchronizerClientInstance.addDependency({
	dependentCollection: "orders",
	refCollection: "users",
	localField: "user_id",
	fieldsToSync: {
		username: "username",
		email: "email"
	}
}).then((response) => {
	console.log("id",response.data);

}).catch(err => {
	console.error(err.response.data);
});
synchronizerClientInstance.addDependency({
	dependentCollection: "orders",
	refCollection: "users",
	localField: "seller_id",
	fieldsToSync: {
		seller_name: "username",
	}
}).then((response) => {
	console.log("id",response.data);

}).catch(err => {
	console.error(err.response.data);
});


const Schema = mongoose.Schema;
const ordersSchema = new Schema({
	product: Array,
	total_price: Number,
	user_id: ObjectId,
	seller_id: ObjectId,
	seller_name: String,
	username: String,
	email: String,
	
});
module.exports = mongoose.model("orders", ordersSchema);