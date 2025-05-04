import express from "express";
import fs from "fs";
import path from "path";
import cors from "cors";

const app = express();
const PORT = 3000;
const uploadDir = path.resolve("uploads");
const playlistPath = path.join(uploadDir, "playlist.m3u8");
const segmentDuration = 5; // in seconds

app.use(cors());
app.use(express.raw({ type: "*/*", limit: "10mb" }));

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Serve static files (segments + playlist + optional player.html)
app.use(express.static(uploadDir));

// Memory-based segment tracking
let mediaSequence = 0;
let segments = [];

app.post("/upload", (req, res) => {
  const filename = req.headers["x-filename"];
  const encodedPlaylist = req.headers["x-playlist"];

  if (!filename || !filename.endsWith(".ts")) {
    return res.status(400).send("Only .ts segments are accepted");
  }

  const filepath = path.join(uploadDir, filename);
  fs.writeFileSync(filepath, req.body);
  console.log("✅ Saved segment:", filename);

  if (encodedPlaylist) {
    try {
      const decoded = decodeURIComponent(encodedPlaylist);
      fs.writeFileSync(playlistPath, decoded);
      console.log("📝 Received and saved playlist.m3u8 from client");
    } catch (err) {
      console.error("❌ Failed to decode or save playlist:", err);
    }
  } else {
    console.warn("⚠️ No playlist data received");
  }

  res.status(200).send("OK");
});

app.post("/reset", (req, res) => {
  const files = fs.readdirSync(uploadDir);
  let deleted = 0;

  for (const file of files) {
    if (file.endsWith(".ts") || file.endsWith(".m3u8")) {
      try {
        fs.unlinkSync(path.join(uploadDir, file));
        deleted++;
      } catch (err) {
        console.warn(`⚠️ Failed to delete: ${file}`);
      }
    }
  }

  segments = [];
  mediaSequence = 0;

  console.log(`🧹 Reset done. Deleted ${deleted} files.`);
  res.status(200).send("Reset complete");
});

app.get("/debug-playlist", (req, res) => {
  const playlistPath = path.join(uploadDir, "playlist.m3u8");

  if (!fs.existsSync(playlistPath)) {
    return res.status(404).send("Playlist not found.");
  }

  const content = fs.readFileSync(playlistPath, "utf-8");
  res.setHeader("Content-Type", "text/plain");
  res.send(content);
});

app.listen(PORT, () => {
  console.log(
    `🚀 CDN Proxy with dynamic playlist ready at http://localhost:${PORT}`
  );
});
