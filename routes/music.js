// routes/music.js
// Minimal Spotify API exploratory routes: Client Credentials flow + search.
// No extra packages. Uses Node 18+ global fetch.

const { ObjectId } = require("mongodb"); // not used yet, but keeps pattern consistent

// --- Config ---
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_BASE  = "https://api.spotify.com/v1";

// We'll cache the token in memory to avoid re-authing every call.
let cachedToken = null;        // string: "BQD...."
let cachedExpiry = 0;          // ms epoch

// Gets a valid app token using Client Credentials flow.
// Caches until ~50 minutes by default (Spotify token = 60 min; we refresh a bit early).
async function getSpotifyToken() {
  const now = Date.now();
  // if we have a token that’s valid for ≥ 60s, reuse it
  if (cachedToken && now < (cachedExpiry - 60 * 1000)) {
    return cachedToken;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in .env");
  }

  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Spotify token error: ${res.status} ${errText}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  cachedExpiry = Date.now() + (data.expires_in || 3600) * 1000; // seconds → ms
  return cachedToken;
}

// Small wrapper to call Spotify Web API with a valid token
async function spotifyFetch(path, params = {}) {
  const token = await getSpotifyToken();
  const url = new URL(API_BASE + path);
  // append any query parameters
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  });

  const res = await fetch(url.toString(), {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Spotify API error: ${res.status} ${errText}`);
  }
  return res.json();
}

module.exports = function musicRoutes(db) {
  const router = require("express").Router();

  // GET /api/music/search?q=calm&type=track&limit=5
  // - q: search query (required)
  // - type: Spotify type; default "track"
  // - limit: default 5
  router.get("/search", async (req, res) => {
    try {
      const q = (req.query.q || "").toString().trim();
      const type = (req.query.type || "track").toString();
      const limit = parseInt(req.query.limit || "5", 10);

      if (!q) return res.status(400).json({ error: "Missing q (search query)" });

      const data = await spotifyFetch("/search", { q, type, limit });

      // Normalize a tiny response for tracks
      let items = [];
      if (data.tracks && Array.isArray(data.tracks.items)) {
        items = data.tracks.items.map(t => ({
          id: t.id,
          name: t.name,
          artists: (t.artists || []).map(a => a.name).join(", "),
          album: t.album?.name || "",
          preview_url: t.preview_url || null,
          external_url: t.external_urls?.spotify || null,
        }));
      }

      return res.json({ ok: true, q, type, limit, items });
    } catch (err) {
      console.error("❌ /api/music/search error", err);
      return res.status(500).json({ error: "Spotify search failed" });
    }
  });

  // Optional: quick recommendations explorer
  // GET /api/music/recommendations?seed_genres=chill&limit=5
  router.get("/recommendations", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit || "5", 10);
      const params = {
        limit,
        seed_genres: (req.query.seed_genres || "chill").toString(), // comma-separated
        // You can play with these later:
        // target_energy: 0.2,
        // target_valence: 0.8,
      };
      const data = await spotifyFetch("/recommendations", params);

      const items = (data.tracks || []).map(t => ({
        id: t.id,
        name: t.name,
        artists: (t.artists || []).map(a => a.name).join(", "),
        album: t.album?.name || "",
        preview_url: t.preview_url || null,
        external_url: t.external_urls?.spotify || null,
      }));

      return res.json({ ok: true, params, items });
    } catch (err) {
      console.error("❌ /api/music/recommendations error", err);
      return res.status(500).json({ error: "Spotify recommendations failed" });
    }
  });

  return router;
};
