// routes/clear.js
const express = require("express");
const { ObjectId } = require("mongodb");

module.exports = function (db) {
  const router = express.Router();
  const affirmations = db.collection("affirmations");
  const emotionLogs = db.collection("emotionLogs");
  const users = db.collection("users");

  // ------------------------
  // 🔁 GET /clear – Clear all data
  // ------------------------
  router.get("/clear", async (req, res) => {
    try {
      await affirmations.deleteMany({});
      await emotionLogs.deleteMany({});
      await users.deleteMany({});
      res.json({ message: "✅ Cleared all affirmations, emotion logs, and users" });
    } catch (err) {
      console.error("❌ Error clearing DB:", err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ------------------------
  // ❌ DELETE /clearall?userId=... – Clear data for a specific user
  // ------------------------
  router.delete("/clearall", async (req, res) => {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    try {
      const objectId = new ObjectId(userId);
      await affirmations.deleteMany({ userId: objectId });
      await emotionLogs.deleteMany({ userId: objectId });
      await users.deleteOne({ _id: objectId });
      res.json({ message: "✅ Cleared user and all their data" });
    } catch (err) {
      console.error("❌ Clear user error:", err);
      res.status(500).json({ error: "Server error" });
    }
  });

  return router;
};
