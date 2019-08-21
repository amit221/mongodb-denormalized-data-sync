const SynchronizerClient = process.env.NODE_ENV === "dev" ? require("../../synchronizer_client") : require("mongodb-data-sync");
const mongoose = require("mongoose");
mongoose.connect(process.env.MONGODB_URL, {useNewUrlParser: true}).catch(console.error);
SynchronizerClient.init({
	dbName: process.env.MONGODB_DB_NAME,// the db name you want the synchronization to work on
	serviceUrl: "http://localhost:6500", // the url for the server
	apiKey: "aaa"//this need to be the same key you declared in your server
});
const OrdersModel = require("./models/orders");
const UsersModel = require("./models/users");

const user = new UsersModel({
	first_name: "first1",
	last_name: "last1",
	username: "username1",
	email: "email1@email.com",
});
const seller = new UsersModel({
	first_name: "first2",
	last_name: "last2",
	username: "username2",
	email: "email2@email.com",
});
const order1 = new OrdersModel({
	product: [],
	total_price: 100,
	user_id: user._id,
	username: user.username,
	seller_id: seller._id,
	seller_name: seller.username,
	email: user.email,
});
(async () => {
	await user.save();
	await seller.save();
	await order1.save();
	user.username = "user changed";
	user.save();
	seller.username = "seller changed";
	seller.save();
})();
