// routes/auth.js
const express = require("express");
const bcrypt = require("bcrypt");
const { ObjectId } = require("mongodb");

module.exports = (db) => {
  const router = express.Router();
  const users = db.collection("users");

  // 🔐 POST /api/login
  router.post("/login", async (req, res) => {
    const { email, password } = req.body;

    try {
      const user = await users.findOne({ email });

      if (!user) {
        return res.status(400).json({ message: "User not found" });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: "Invalid password" });
      }

      const { password: _, ...userData } = user;
      res.json({ message: "Login successful", user: userData });
    } catch (err) {
      console.error("❌ Login error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  // 📝 POST /api/register
  router.post("/register", async (req, res) => {
    const { firstName, lastName, email, password, dob, gender } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    try {
      const existingUser = await users.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = {
        firstName,
        lastName,
        email,
        password: hashedPassword,
        dob,
        gender,
        createdAt: new Date()
      };

      const result = await users.insertOne(newUser);
      res.status(201).json({ message: "User registered", userId: result.insertedId });
    } catch (err) {
      console.error("❌ Registration error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  return router;
};
