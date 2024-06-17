const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  client_offset: { type: String, unique: true },
  content: String,
  username: String,
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Message', messageSchema);
