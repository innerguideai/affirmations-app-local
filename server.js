// ------------------------
// 📦 Module Imports
// ------------------------
const express = require("express");
const fs = require("fs");
const cors = require("cors");
const { MongoClient } = require("mongodb");
const { ObjectId } = require("mongodb"); 
const OpenAI = require("openai");
// For OpenAI
require("dotenv").config(); // Load env variables from .env
// ✅ Route modules as functions (defer db injection)
const authRoutesFn = require("./routes/auth");
const affirmationsRouteFn = require("./routes/affirmations");
const emotionRoutesFn = require("./routes/emotions");
const adminRoutesFn = require("./routes/admin");
const clearRoutesFn = require("./routes/clear");
const USERS_FILE = "./users.json";
const mongoURI = "mongodb://localhost:27017";
const client = new MongoClient(mongoURI);
const exportRoutesFn = require("./routes/export");      // add with other requires
const musicRoutesFn = require("./routes/music");

console.log("🌐 Connecting to MongoDB:", mongoURI);

// ------------------------
// 🚀 Initialize Express
// ------------------------
const app = express();
const PORT = 3000;

// ------------------------
// 🔧 Middleware
// ------------------------
app.use(cors());
app.use(express.json());
app.use(express.static("public"));


// ------------------------
// 🔐 Debug Logging
// ------------------------
console.log("🔐 Loaded API Key:", process.env.OPENAI_API_KEY);

// ------------------------
// 📁 Load & Save JSON Users
// ------------------------
function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, "[]");
  }
  const data = fs.readFileSync(USERS_FILE, "utf-8");
  return JSON.parse(data);
}
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}
// ------------------------
// 🌐 Connect to MongoDB and Start Server
// ------------------------
(async () => {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");

    const db = client.db("affirmationsDB");
    console.log("📂 Using database:", db.databaseName);

        app.get("/debug/users", async (req, res) => {
      try {
        const users = await db.collection("users").find({}).toArray();
        res.json(users);
      } catch (error) {
        console.error("❌ Failed to fetch users:", error);
        res.status(500).json({ error: "Could not fetch users" });
      }
    });
    console.log("✅ Mounting /api/affirmations route");
    // ✅ Register routes after DB is ready
    app.use("/api", authRoutesFn(db));
    app.use("/api/affirmations", affirmationsRouteFn(db)); // ✅ already mounted
    app.use("/api/affirmations/clear", clearRoutesFn(db)); // ✅ mount /rate and /clear endpoints
    app.use("/api/emotions", emotionRoutesFn(db));
    app.use("/admin", adminRoutesFn(db));

     console.log("✅ Mounted /api/affirmations"); 
     
    const streakRoutesFn = require("./routes/streaks");
    app.use("/api/streaks", streakRoutesFn(db));
    console.log("✅ Mounted /api/streaks");
    app.use("/api/export", exportRoutesFn(db));
    console.log("✅ Mounted /api/export");
app.use("/api/music", musicRoutesFn(db));
console.log("✅ Mounted /api/music");

  

    // ❤️ Health check
    app.get("/", (req, res) => {
      res.send("✅ Backend is running and reachable!");
    });

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running at http://0.0.0.0:${PORT}`);
    });
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
  }
})();
