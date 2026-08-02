// routes/affirmations.js
const express = require("express");
const { MongoClient } = require("mongodb");
const { ObjectId } = require("mongodb");
const OpenAI = require("openai");
const { verifyUserToken } = require("../utils/jwt");

module.exports = function (db) {
  const router = express.Router();
  const affirmations = db.collection("affirmations");
  console.log("📁 Affirmation collection namespace:", affirmations.namespace);

  // ------------------------
  // 🔐 Resolve authenticated user ID for My Affirmations routes
  //    (session first, verified JWT fallback — no client-supplied userId trusted)
  // ------------------------
  async function resolveAuthenticatedUserId(req) {
    const sessionUserId = req.session?.user?.id;
    if (sessionUserId) return String(sessionUserId);

    const authHeader = req.headers.authorization || "";
    const [scheme, token] = authHeader.split(" ");
    if (scheme === "Bearer" && token) {
      try {
        const decoded = await verifyUserToken(token);
        const appUserId = decoded?.appUserId || decoded?.id || decoded?._id;
        if (appUserId) return String(appUserId);
      } catch (err) {
        // invalid/expired token -> fall through to unauthenticated
      }
    }

    return null;
  }

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
    const { emotion, userId, driver, pressure, excludeIds = [], shouldLog = false } = req.body;

    console.log("Context received:", { emotion, driver, pressure });

    console.log("gpt route shouldLog:", shouldLog, "emotion:", emotion);
    if (!emotion || !userId) {
      return res.status(400).json({ error: "Missing emotion or userId" });
    }

    try {
      // ✅ Log ONLY if this is the initial fetch (no excludeIds)
        if (!excludeIds || excludeIds.length === 0) {
          await logEmotion(emotion, userId);
        }

//        const query = {
//        emotion: emotion.toLowerCase(),
//        userId: new ObjectId(userId),
//      	hidden: { $ne: true },
//	_id: { $nin: excludeIds.map(id => new ObjectId(id)) }, // ✅ exclude shown affirmations
//      };

const baseQuery = {
  emotion: emotion.toLowerCase(),
  userId: new ObjectId(userId),
  hidden: { $ne: true },
  _id: { $nin: excludeIds.map(id => new ObjectId(id)) },
};

// Try most specific context first
let query = { ...baseQuery };

if (driver && pressure) {
  query = {
    ...baseQuery,
    "context.driver": driver,
    "context.pressure": pressure
  };
} else if (driver) {
  query = {
    ...baseQuery,
    "context.driver": driver
  };
}



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
        .find({ emotion: emotion.toLowerCase(), userId: new ObjectId(userId), hidden: { $ne: true }, })
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
/* commented
  // ------------------------
    // ⭐️ POST /api/affirmations/gpt – Rate an affirmation
    // ------------------------
    router.post("/gpt", async (req, res) => {
    const { emotion, userId , shouldLog= false} = req.body;

console.log("[gpt] avoidPhrases:", Array.isArray(req.body.avoidPhrases) ? req.body.avoidPhrases.slice(0, 10) : req.body.avoidPhrases);


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
            content: "You are a motivational speaker. You write short, uplifting affirmations. Always reply with exactly ONE sentence as a first-person “I” statement in the present tense. No quotes, no lists.",
          },
          {
            role: "user",
	    content: `Give me one short, uplifting affirmation for someone feeling ${emotion}. Context: the feeling is driven by ${driver || "personal circumstances"} and the pressure is ${pressure || "internal stress"}.
Start the sentence with "I" and return only the sentence.`,
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

console.log("[gpt] insert doc =", doc);

      const result = await affirmations.insertOne(doc);
      res.json({ from: "ai", affirmation: { ...doc, _id: result.insertedId } });
    } catch (err) {
      console.error("❌ GPT error:", err);
      res.status(500).json({ error: "Error generating affirmation" });
    }
  });

*/

// ------------------------
// ⭐ POST /api/affirmations/gpt – Generate an AI affirmation (and optionally log emotion)
// ------------------------
router.post("/gpt", async (req, res) => {
  const { emotion, userId, driver, pressure, shouldLog = false, avoidPhrases } = req.body;
  if (!emotion || !userId) {
    return res.status(400).json({ error: "Missing emotion or userId" });
  }

  try {
    // ✅ Only log when explicitly asked (I'm feeling this)
    if (shouldLog) {
      await logEmotion(emotion, userId);
    }

    // =========================
    // Prompt hygiene (optional): avoid phrases
    // - Backwards compatible: if client doesn't send it, nothing changes
    // - Hard caps so prompt doesn't bloat
    // =========================
    const rawAvoid = Array.isArray(avoidPhrases) ? avoidPhrases : [];

    const cleanedAvoid = rawAvoid
      .filter((p) => typeof p === "string")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => (p.length > 140 ? p.slice(0, 140) : p))
      .slice(0, 10);

    let contextText = "";

    if (driver) contextText += ` related to ${driver}`;
    if (pressure) contextText += ` due to ${pressure}`;

    // Build the optional clause (your chosen wording style)
    let avoidClause = "";
    if (cleanedAvoid.length > 0) {
      // Quote each phrase so GPT treats them as exact phrases
      const quoted = cleanedAvoid.map((p) => `"${p.replace(/"/g, "")}"`);
      avoidClause = ` Use fresh wording; do not reuse: ${quoted.join(" | ")}.`;
    }

console.log("[gpt] /api/affirmations/gpt", {
  emotion: String(emotion).toLowerCase(),
  userId: String(userId),
  driver: driver || "",
  pressure: pressure || "",
  shouldLog: !!shouldLog,
  avoidCount: cleanedAvoid.length,
});


    // Main user prompt (append avoidClause only if present)
    const userPrompt =
     `Give me one short, uplifting affirmation for someone feeling ${emotion}${contextText}. ` +
     `Context: the feeling is driven by ${driver || "personal circumstances"} and the pressure is ${pressure || "internal stress"}. ` +
     `Keep it under 12 words. ` +
     `Start the sentence with “I ” and return only the sentence.` +
      avoidClause;

    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are a motivational speaker. You write short, uplifting affirmations. Always reply with exactly ONE sentence as a first-person “I” statement in the present tense.",
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      max_tokens: 40,
    });

    const generatedText = chatCompletion.choices[0].message.content.trim();
const doc = {
  text: generatedText,
  emotion: String(emotion).toLowerCase(),
  userId: new ObjectId(userId),
  context: {
    driver: driver || null,
    pressure: pressure || null
  },
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
    // 🔖 POST /api/affirmations/unsave – Remove an affirmation from "My Affirmations"
    //    (soft-hide only — never touches rating, text, emotion, context, or hidden)
    // ------------------------
    router.post("/unsave", async (req, res) => {
      const userId = await resolveAuthenticatedUserId(req);

      if (!userId || !ObjectId.isValid(userId)) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { affirmationId } = req.body;

      if (!affirmationId || !ObjectId.isValid(affirmationId)) {
        return res.status(400).json({ error: "Invalid affirmationId" });
      }

      try {
        const result = await affirmations.updateOne(
          { _id: new ObjectId(affirmationId), userId: new ObjectId(userId) },
          { $set: { removedFromMyAffirmations: true, removedAt: new Date() } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ error: "Affirmation not found" });
        }

        res.status(200).json({ message: "Affirmation removed successfully" });
      } catch (err) {
        console.error("❌ Error removing affirmation:", err);
        res.status(500).json({ error: "Failed to remove affirmation" });
      }
    });

    // ------------------------
    // 🔖 GET /api/affirmations/saved – List the authenticated user's affirmations
    //    for "My Affirmations": last 30 days, newest first, not removed/hidden.
    //    No projection applied, so context.driver/context.pressure and every
    //    other existing field come back untouched.
    // ------------------------
    router.get("/saved", async (req, res) => {
      const userId = await resolveAuthenticatedUserId(req);

      if (!userId || !ObjectId.isValid(userId)) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const saved = await affirmations
          .find({
            userId: new ObjectId(userId),
            createdAt: { $gte: thirtyDaysAgo },
            hidden: { $ne: true },
            removedFromMyAffirmations: { $ne: true },
          })
          .sort({ createdAt: -1 })
          .toArray();

        res.json({ saved });
      } catch (err) {
        console.error("❌ Error fetching affirmations:", err);
        res.status(500).json({ error: "Failed to fetch affirmations" });
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
  const { emotion, userId, driver, pressure } = req.query;

  if (!emotion || !userId) {
    return res.status(400).json({ error: "Missing emotion or userId" });
  }

  try {
    const query = {
      emotion: String(emotion).toLowerCase(),
      userId: new ObjectId(userId),
      hidden: { $ne: true }
    };

    // Match the same nested shape used when GPT affirmations are saved
    if (driver) {
      query["context.driver"] = driver;
    }

    if (pressure) {
      query["context.pressure"] = pressure;
    }

    console.log("[count] query =", query);

    const count = await affirmations.countDocuments(query);

    console.log("[count] result =", {
      emotion: String(emotion).toLowerCase(),
      userId: String(userId),
      driver: driver || "",
      pressure: pressure || "",
      count
    });

    res.json({ count });
  } catch (err) {
    console.error("❌ Error counting affirmations:", err);
    res.status(500).json({ error: "Server error" });
  }
});

    return router;
};
