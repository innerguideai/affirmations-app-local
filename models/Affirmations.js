const mongoose = require("mongoose");

const AffirmationSchema = new mongoose.Schema({
  emotion: { type: String, required: true },
  text: { type: String, required: true },
  rating: { type: Number, default: 3.0 },
  createdAt: { type: Date, default: Date.now },
  source: { type: String, default: "GPT" }
});

module.exports = mongoose.model("Affirmation", AffirmationSchema);
