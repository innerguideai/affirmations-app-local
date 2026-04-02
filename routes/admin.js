// routes/admin.js
const express = require("express");
const { ObjectId } = require("mongodb");

module.exports = function (db) {
  const router = express.Router();
  const users = db.collection("users");
  const emotionLogs = db.collection("emotionlogs");
  const affirmations = db.collection("affirmations");

  // ------------------------
  // 👤 GET /admin/users – List all users
  // ------------------------
  router.get("/users", async (req, res) => {
    console.log("📥 Admin: Fetching all users");
    try {
      const allUsers = await users.find().toArray();
      res.json(allUsers);
    } catch (err) {
      console.error("❌ Error fetching users:", err);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // ------------------------
  // 📊 GET /admin/emotions – List all emotion logs
  // ------------------------
  router.get("/emotions", async (req, res) => {
    console.log("📥 Admin: Fetching all emotion logs");
    try {
      const logs = await emotionLogs
        .find({ emotion: { $exists: true } }) // Ensures we filter correctly
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray();
      res.json(logs);
    } catch (err) {
      console.error("❌ Error fetching emotion logs:", err);
      res.status(500).json({ error: "Failed to fetch logs" });
    }
  });

  // ------------------------
  // 📝 GET /admin/affirmations – List all affirmations
  // ------------------------
  router.get("/affirmations", async (req, res) => {
    console.log("📥 Admin: Fetching all affirmations");
    try {
      const all = await affirmations.find().sort({ createdAt: -1 }).limit(100).toArray();
      res.json(all);
    } catch (err) {
      console.error("❌ Error fetching affirmations:", err);
      res.status(500).json({ error: "Failed to fetch affirmations" });
    }
  });

  // ------------------------
  // 🧪 GET /admin/mock – Add mock data for testing
  // ------------------------
  router.get("/mock", async (req, res) => {
    console.log("📥 Admin: Inserting mock emotion data");
    try {
      const now = new Date();
      const result = await emotionLogs.insertMany([
        { userId: new ObjectId("6889843d3bc89c2adb30e2a9"), emotion: "anxious", createdAt: now },
        { userId: new ObjectId("6889843d3bc89c2adb30e2a9"), emotion: "anxious", createdAt: now },
        { userId: new ObjectId("6889843d3bc89c2adb30e2a9"), emotion: "anxious", createdAt: now },
        { userId: new ObjectId("6889843d3bc89c2adb30e2a9"), emotion: "hopeful", createdAt: now },
        { userId: new ObjectId("6889843d3bc89c2adb30e2a9"), emotion: "hopeful", createdAt: now }
      ]);
      res.json({ message: "Mock data inserted", count: result.insertedCount });
    } catch (err) {
      console.error("❌ Error inserting mock data:", err);
      res.status(500).json({ error: "Failed to insert mock data" });
    }
  });

  return router;
};
