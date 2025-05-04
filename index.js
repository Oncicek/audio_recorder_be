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

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use(express.static(uploadDir));

let mediaSequence = 0;
let segments = [];

app.post("/upload", (req, res) => {
  const filename = req.headers["x-filename"];

  if (!filename || !filename.endsWith(".ts")) {
    return res.status(400).send("Only .ts segments are accepted");
  }

  const filepath = path.join(uploadDir, filename);
  fs.writeFileSync(filepath, req.body);
  console.log("✅ Saved segment:", filename);

  segments.push(filename);

  const playlist = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    `#EXT-X-TARGETDURATION:${segmentDuration}`,
    `#EXT-X-MEDIA-SEQUENCE:0`,
    ...segments.map((seg) => `#EXTINF:${segmentDuration}.000,\n${seg}`),
    "#EXT-X-ENDLIST",
    "",
  ].join("\n");

  fs.writeFileSync(playlistPath, playlist);
  console.log("📝 Updated playlist.m3u8");

  res.status(200).send("OK");
});

app.get("/segments", (req, res) => {
  fs.readdir(uploadDir, (err, files) => {
    if (err) return res.status(500).json({ error: "Failed to list files" });
    const tsSegments = files.filter((f) => f.endsWith(".ts")).sort();
    res.json(tsSegments);
  });
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

app.get("/playlist.m3u8", (req, res) => {
  const currentSegments = fs
    .readdirSync(uploadDir)
    .filter((f) => f.endsWith(".ts"))
    .sort();

  if (currentSegments.length === 0) {
    const emptyPlaylist = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      `#EXT-X-TARGETDURATION:${segmentDuration}`,
      "#EXT-X-MEDIA-SEQUENCE:0",
      "#EXT-X-ENDLIST",
    ].join("\n");

    return res
      .status(200)
      .setHeader("Content-Type", "application/vnd.apple.mpegurl")
      .send(emptyPlaylist);
  }

  segments = currentSegments;

  const playlist = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    `#EXT-X-TARGETDURATION:${segmentDuration}`,
    `#EXT-X-MEDIA-SEQUENCE:0`,
    ...segments.map((seg) => `#EXTINF:${segmentDuration}.000,\n${seg}`),
    "#EXT-X-ENDLIST",
    "",
  ].join("\n");

  fs.writeFileSync(playlistPath, playlist);
  console.log("🛠️ Rebuilt playlist.m3u8 from existing segments");

  const content = fs.readFileSync(playlistPath, "utf-8");
  res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
  res.send(content);
});

app.get("/debug-playlist", (req, res) => {
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
