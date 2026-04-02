// routes/affirmations.js
const express = require("express");
const { MongoClient } = require("mongodb");
const { ObjectId } = require("mongodb"); 
const OpenAI = require("openai");

module.exports = function (db) {
  const router = express.Router();
  const affirmations = db.collection("affirmations");
  console.log("📁 Affirmation collection namespace:", affirmations.namespace);

  // ------------------------
  // 🤖 GPT Config
  // ------------------------
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const emotionLogs = db.collection("emotionlogs");

  async function logEmotion(emotion, userId) {
    try {
      await emotionLogs.insertOne({
        emotion: emotion.toLowerCase(),
        userId: new ObjectId(userId),
        createdAt: new Date(),
      });
    } catch (e) {
      console.error("❌ Failed to log emotion:", e.message);
    }
  }

  // ------------------------
  // 🌈 POST /api/affirmations – Fetch or generate affirmation
  // ------------------------
  router.post("/", async (req, res) => {
    const { emotion, userId, excludeIds =[], shouldLog= false} = req.body;
      console.log("gpt route shouldLog:", shouldLog, "emotion:", emotion);
    if (!emotion || !userId) {
      return res.status(400).json({ error: "Missing emotion or userId" });
    }

    try {
      // ✅ Log ONLY if this is the initial fetch (no excludeIds)
        if (!excludeIds || excludeIds.length === 0) {
          await logEmotion(emotion, userId);
        }
        const query = {
        emotion: emotion.toLowerCase(),
        userId: new ObjectId(userId),
        _id: { $nin: excludeIds.map(id => new ObjectId(id)) }, // ✅ exclude shown affirmations
      };

      // Check DB for affirmations for this user + emotion + excluded id
      const matches = await affirmations
        .find(query)
        .sort({ rating: -1 })
        .toArray();

      if (matches.length > 0) {
        return res.json({ from: "db", affirmation: matches[0] });
      } else {
          //console.log("AI affirmation");
            return res.status(404).json({ error: "No DB affirmations found" });
      }
    } catch (err) {
      console.error("❌ GPT error:", err);
      res.status(500).json({ error: "Error generating affirmation" });
    }
  });

  // ------------------------
  // 🔁 GET /api/affirmations/next – Get next-best rated one
  // ------------------------
  router.get("/next", async (req, res) => {
    const { emotion, currentId, userId } = req.query;


    if (!emotion || !currentId || !userId) {
      return res.status(400).json({ error: "Missing emotion, currentId, or userId" });
    }

    try {
      const all = await affirmations
        .find({ emotion: emotion.toLowerCase(), userId: new ObjectId(userId) })
        .sort({ rating: -1 })
        .toArray();

      const currentIndex = all.findIndex((a) => a._id.toString() === currentId);
      const nextAffirmation = all[currentIndex + 1];

      if (nextAffirmation) {
        res.json({ next: nextAffirmation });
      } else {
        res.json({ next: null });
      }
    } catch (err) {
      console.error("❌ Next affirmation error:", err);
      res.status(500).json({ error: "Failed to fetch next affirmation" });
    }
  });

  // ------------------------
    // ⭐️ POST /api/affirmations/gpt – Rate an affirmation
    // ------------------------
    router.post("/gpt", async (req, res) => {
    const { emotion, userId , shouldLog= false} = req.body;

    if (!emotion || !userId) {
      return res.status(400).json({ error: "Missing emotion or userId" });
    }

    try {
      // ✅ Only log when explicitly asked (I'm feeling this)
      if (shouldLog) {
        await logEmotion(emotion, userId);
      }

      const chatCompletion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are an assistant who gives short, uplifting affirmations.",
          },
          {
            role: "user",
            content: `Give me one short, uplifting affirmation for someone feeling ${emotion}. Only return the sentence.`,
          },
        ],
        max_tokens: 60,
      });

      const generatedText = chatCompletion.choices[0].message.content.trim();

      const doc = {
        text: generatedText,
        emotion: emotion.toLowerCase(),
        userId: new ObjectId(userId),
        rating: 0,
        createdAt: new Date(),
      };

      const result = await affirmations.insertOne(doc);
      res.json({ from: "ai", affirmation: { ...doc, _id: result.insertedId } });
    } catch (err) {
      console.error("❌ GPT error:", err);
      res.status(500).json({ error: "Error generating affirmation" });
    }
  });

    // ------------------------
    // ⭐️ POST /api/affirmations/rate – Rate an affirmation
    // ------------------------
    router.post("/rate", async (req, res) => {
      const { userId, affirmationId, rating } = req.body;

      if (!userId || !affirmationId || rating == null) {
        return res.status(400).json({ error: "Missing userId, affirmationId, or rating" });
      }

      if (!affirmationId || typeof rating !== "number") {
        return res.status(400).json({ error: "Missing or invalid inputs" });
      }
      try {
        const result = await db.collection("affirmations").updateOne(
        { _id: new ObjectId(affirmationId), userId: new ObjectId(userId) },

          { $set: { rating: parseInt(rating) } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ error: "Affirmation not found or user mismatch" });
        }

        res.status(200).json({ message: "Rating saved successfully" });
      } catch (err) {
        console.error("❌ Error saving rating:", err);
        res.status(500).json({ error: "Failed to save rating" });
      }
    });
    // ------------------------
    // 🧹 POST /api/affirmations/clear – Delete all affirmations (DEV ONLY)
    // ------------------------
    router.post("/clear", async (req, res) => {
      try {
        const result = await affirmations.deleteMany({});
        res.json({ message: "All affirmations cleared", deletedCount: result.deletedCount });
      } catch (err) {
        console.error("❌ Failed to clear affirmations:", err);
        res.status(500).json({ error: "Failed to clear affirmations" });
      }
    });
    console.log("✅ /api/affirmations routes registered");

    // ------------------------
    // GET /api/affirmations/count?emotion=sad&userId=123
    // ------------------------
    router.get("/count", async (req, res) => {
      const { emotion, userId } = req.query;
      console.log("emotion",emotion?.toLowerCase());
      console.log("user",userId);
      if (!emotion || !userId) {
        return res.status(400).json({ error: "Missing emotion or userId" });
      }

      try {
        const count = await affirmations.countDocuments({
          emotion: emotion.toLowerCase(),
          userId: new ObjectId(userId)
        });
        console.log("count",count);
        res.json({ count });
      } catch (err) {
        console.error("❌ Error counting affirmations:", err);
        res.status(500).json({ error: "Server error" });
      }
    });
    console.log("✅ /api/count routes registered");

    router.get("/debug-user-match", async (req, res) => {
      const { emotion, userId } = req.query;

      try {
      const query = {
        emotion: emotion.toLowerCase(),
        userId: new ObjectId(userId)
      };

              // Check DB for affirmations for this user + emotion + excluded id
      const matches = await affirmations
        .find({
        }).toArray();

      if (matches.length > 0) {
        console.log("matched");
      } else {
        console.log("not matched");
      }

      const results = await affirmations
      .find({
        emotion: emotion.toLowerCase()
      }).toArray();

      results.forEach(doc => {
  console.log("🧾 DB doc userId:", doc.userId.toHexString?.());
  console.log("🔍 Comparing with:", userId);
});
      const filtered = results.filter(doc =>
        doc.userId?.toHexString?.().trim() === userId.trim()

      );


        res.json({ all: results.length, matched: filtered.length, docs: filtered });
      } catch (err) {
        res.status(500).json({ error: "Debug route failed", details: err.message });
      }
    });

    // ✅ Unified route for fetching affirmations
router.post("/unified", async (req, res) => {
  try {
    const { emotion, userId, excludeIds = [] } = req.body;

    if (!emotion || !userId) {
      return res.status(400).json({ error: "Missing emotion or userId" });
    }

    // Count affirmations for this user/emotion
    const count = await affirmations.countDocuments({
      emotion: emotion.toLowerCase(),
      userId: new ObjectId(userId),
    });

    console.log(`📊 Affirmation count for '${emotion}':`, count);

    if (count <= 2) {
      // 🟢 GPT fallback path
      console.log("✨ Using GPT fallback during learning phase...");

      const chatCompletion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are an assistant who gives short, uplifting affirmations.",
          },
          {
            role: "user",
            content: `Give me one short, uplifting affirmation for someone feeling ${emotion}. Only return the sentence.`,
          },
        ],
        max_tokens: 60,
      });

      const generatedText = chatCompletion.choices[0].message.content.trim();

      const doc = {
        text: generatedText,
        emotion: emotion.toLowerCase(),
        userId: new ObjectId(userId),
        rating: 0,
        createdAt: new Date(),
      };

      const result = await affirmations.insertOne(doc);
      return res.json({ from: "ai", affirmation: { ...doc, _id: result.insertedId } });

    } else {
      // 🟢 DB fetch path (respecting excludeIds)
      console.log("📥 Fetching from DB (top-rated)...");
      const matches = await affirmations
        .find({
          emotion: emotion.toLowerCase(),
          userId: new ObjectId(userId),
          _id: { $nin: excludeIds.map(id => new ObjectId(id)) },
        })
        .sort({ rating: -1 })
        .toArray();

      if (matches.length > 0) {
        return res.json({ from: "db", affirmation: matches[0] });
      } else {
        return res.status(404).json({ error: "No DB affirmations found" });
      }
    }
  } catch (err) {
    console.error("❌ Error in unified affirmation route:", err);
    res.status(500).json({ error: "Server error fetching affirmation" });
  }
});

    return router;
};

