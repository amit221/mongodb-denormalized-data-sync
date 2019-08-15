const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const usersSchema = new Schema({
	first_name: String,
	last_name: String,
	username: String,
	email: String,
	
});
module.exports = mongoose.model('users', usersSchema);