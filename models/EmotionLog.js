// models/EmotionLog.js
const mongoose = require("mongoose");

const emotionLogSchema = new mongoose.Schema({
  emotion: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true, // enables efficient date range queries
  }
});

module.exports = mongoose.model("EmotionLog", emotionLogSchema);
