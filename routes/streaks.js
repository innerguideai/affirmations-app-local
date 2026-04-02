// routes/streaks.js
const { ObjectId } = require("mongodb");

const APP_TZ = "America/New_York";

// Format a date as YYYY-MM-DD in given TZ
function ymdInTZ(date = new Date(), timeZone = APP_TZ) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// Get yesterday's date string in TZ
function ymdYesterdayInTZ(timeZone = APP_TZ) {
  const msInDay = 24 * 60 * 60 * 1000;
  const d = new Date(Date.now() - msInDay);
  return ymdInTZ(d, timeZone);
}

// Extract userId from request
function getUserIdFromReq(req) {
  const h = req.header("x-user-id");
  if (h) return h;
  if (req.body && req.body.userId) return req.body.userId;
  if (req.query && req.query.userId) return req.query.userId;
  return null;
}

module.exports = function streakRoutes(db) {
  const router = require("express").Router();

  async function updateUserStreak(userId) {
    const usersCol = db.collection("users");
    const _id = new ObjectId(userId);

    const user = await usersCol.findOne(
      { _id },
      { projection: { currentStreak: 1, bestStreak: 1, lastReflectionDate: 1 } }
    );

    const today = ymdInTZ();
    const yesterday = ymdYesterdayInTZ();

    let currentStreak = user?.currentStreak || 0;
    let bestStreak = user?.bestStreak || 0;
    const last = user?.lastReflectionDate || null;

    if (!last) {
      currentStreak = 1;
    } else if (last === today) {
      // already logged today → no change
    } else if (last === yesterday) {
      currentStreak = currentStreak + 1;
    } else {
      currentStreak = 1;
    }

    if (currentStreak > bestStreak) bestStreak = currentStreak;

    await usersCol.updateOne(
      { _id },
      {
        $set: {
          currentStreak,
          bestStreak,
          lastReflectionDate: today,
          updatedAt: new Date(),
        },
      }
    );

    return { currentStreak, bestStreak, lastReflectionDate: today };
  }

  // POST /api/streaks/reflection
  router.post("/reflection", async (req, res) => {
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) return res.status(401).json({ error: "Missing userId" });

      const { emotion, text } = req.body || {};
      if (!emotion || typeof emotion !== "string") {
        return res.status(400).json({ error: "Missing or invalid 'emotion'" });
      }

      const reflectionsCol = db.collection("reflections");
      const doc = {
        userId: new ObjectId(userId),
        emotion,
        text: text || "",
        day: ymdInTZ(),
        createdAt: new Date(),
      };

      await reflectionsCol.insertOne(doc);
      const streak = await updateUserStreak(userId);

      res.status(201).json({ ok: true, reflection: doc, streak });
    } catch (err) {
      console.error("❌ POST /reflection error", err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // GET /api/streaks
  router.get("/", async (req, res) => {
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) return res.status(401).json({ error: "Missing userId" });

      const usersCol = db.collection("users");
      const _id = new ObjectId(userId);
      const user = await usersCol.findOne(
        { _id },
        { projection: { currentStreak: 1, bestStreak: 1, lastReflectionDate: 1 } }
      );

      res.json({
        currentStreak: user?.currentStreak || 0,
        bestStreak: user?.bestStreak || 0,
        lastReflectionDate: user?.lastReflectionDate || null,
        today: ymdInTZ(),
      });
    } catch (err) {
      console.error("❌ GET /streaks error", err);
      res.status(500).json({ error: "Server error" });
    }
  });

  return router;
};
