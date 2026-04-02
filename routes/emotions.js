// routes/emotions.js
const express = require("express");
const { ObjectId } = require("mongodb");

module.exports = function (db) {
  const router = express.Router();
  const emotionLogs = db.collection("emotionlogs");

  // ------------------------
  // 🧠 POST /api/emotions – Log an emotion
  // ------------------------
  router.post("/", async (req, res) => {
    const { emotion, userId } = req.body;

    if (!emotion || !userId) {
      return res.status(400).json({ error: "Missing emotion or userId" });
    }

    try {
      const timestamp = new Date();
      const result = await emotionLogs.insertOne({
        emotion: emotion.toLowerCase(),
        userId: new ObjectId(userId),
        createdAt: timestamp
      });
      res.status(201).json({ message: "Emotion logged", id: result.insertedId });
    } catch (err) {
      console.error("❌ Emotion log error:", err);
      res.status(500).json({ error: "Failed to log emotion" });
    }
  });

  // ------------------------
  // 📊 GET /api/emotions/top – Top 3 emotions in last 30 days
  // ------------------------
  router.get("/top", async (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    try {
      const topEmotions = await emotionLogs.aggregate([
        {
          $match: {
            userId: new ObjectId(userId),
            createdAt: { $gte: thirtyDaysAgo }
          }
        },
        {
          $group: {
            _id: "$emotion",
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 3 },
        {
          $project: {
            _id: 0,
            emotion: "$_id",
            count: 1
          }
        }
      ]).toArray();

      res.json({ topEmotions });
    } catch (err) {
      console.error("❌ Top emotions error:", err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ------------------------
  // ♻️ GET /api/emotions/repeated – Emotions 3+ times in last 7 days
  // ------------------------
  router.get("/repeated", async (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    try {
      const repeated = await emotionLogs.aggregate([
        {
          $match: {
            userId: new ObjectId(userId),
            createdAt: { $gte: sevenDaysAgo }
          }
        },
        {
          $group: {
            _id: "$emotion",
            count: { $sum: 1 }
          }
        },
        { $match: { count: { $gte: 3 } } },
        {
          $project: {
            _id: 0,
            emotion: "$_id",
            count: 1
          }
        }
      ]).toArray();

      res.json({ repeatedEmotions: repeated });
    } catch (err) {
      console.error("❌ Error fetching repeated emotions:", err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ------------------------
  // 🧪 GET /api/emotions/debug – Last 10 emotion logs (debug only)
  // ------------------------
  router.get("/debug", async (req, res) => {
    try {
      const logs = await emotionLogs
        .find({})
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray();
      res.json(logs);
    } catch (err) {
      console.error("❌ Debug log error:", err);
      res.status(500).json({ error: "Could not fetch emotion logs" });
    }
  });
// GET /api/emotions/patterns?userId=...&windowDays=7&threshold=3
// Returns counts for the last N days and a "triggers" list for emotions over threshold
router.get("/patterns", async (req, res) => {
  try {
    const { userId, windowDays = 7, threshold = 3 } = req.query;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    const days = parseInt(windowDays, 10) || 7;
    const minCount = parseInt(threshold, 10) || 3;

    const since = new Date();
    since.setDate(since.getDate() - days);

    const EmotionLogs = db.collection("emotionlogs"); // or whatever your collection name is

    // Pull logs for user in last N days
    const logs = await EmotionLogs
      .find({
        userId: new ObjectId(userId),
        createdAt: { $gte: since }
      })
      .project({ emotion: 1, createdAt: 1 })
      .toArray();

    // Count per emotion (case-insensitive normalize)
    const counts = {};
    for (const l of logs) {
      const key = (l.emotion || "").toLowerCase().trim();
      if (!key) continue;
      counts[key] = (counts[key] || 0) + 1;
    }

    // Build triggers over the threshold
    const triggers = Object.entries(counts)
      .filter(([_, c]) => c > minCount)
      .map(([emotion, count]) => ({ emotion, count }));

    res.json({
      windowDays: days,
      threshold: minCount,
      totalLogs: logs.length,
      counts,        // e.g., { sad: 5, anxious: 2 }
      triggers       // e.g., [ { emotion: 'sad', count: 5 } ]
    });
  } catch (err) {
    console.error("❌ /api/emotions/patterns failed:", err);
    res.status(500).json({ error: "Server error" });
  }
});

  return router;
};
