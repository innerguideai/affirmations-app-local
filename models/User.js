const mongoose = require('mongoose');

// Define schema
const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  dateOfBirth: { type: Date },
  gender: { type: String, enum: ['Male', 'Female', 'Non-binary', 'Prefer not to say'], default: 'Prefer not to say' },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  createdAt: { type: Date, default: Date.now },
  emotionHistory: { type: Array, default: [] }
});

// Export model
module.exports = mongoose.model('User', userSchema);
