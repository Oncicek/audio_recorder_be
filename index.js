import express from "express";
import fs from "fs";
import path from "path";
import cors from "cors";
import { execSync } from "child_process";

const app = express();
const PORT = 3000;
const uploadDir = path.resolve("uploads");
const playlistPath = path.join(uploadDir, "playlist.m3u8");
const segmentDuration = 5; // default fallback

app.use(cors());
app.use(express.raw({ type: "*/*", limit: "10mb" }));

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use(express.static(uploadDir));

const segmentMeta = []; // Stores { filename, duration }
let recordingStopped = false;

function getSegmentDuration(filename) {
  try {
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filename}"`
    );
    return parseFloat(result.toString().trim()) || segmentDuration;
  } catch {
    return segmentDuration;
  }
}

app.post("/upload", (req, res) => {
  const filename = req.headers["x-filename"];

  if (!filename || !filename.endsWith(".ts")) {
    return res.status(400).send("Only .ts segments are accepted");
  }

  const filepath = path.join(uploadDir, filename);
  fs.writeFileSync(filepath, req.body);
  console.log("✅ Saved segment:", filename);

  const duration = getSegmentDuration(filepath);
  segmentMeta.push({ filename, duration });

  const playlist = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-START:TIME-OFFSET=0",
    `#EXT-X-TARGETDURATION:${Math.ceil(
      Math.max(...segmentMeta.map((s) => s.duration), segmentDuration)
    )}`,
    "#EXT-X-MEDIA-SEQUENCE:0",
    ...segmentMeta.map(
      ({ filename, duration }) => `#EXTINF:${duration.toFixed(3)},\n${filename}`
    ),
    ...(recordingStopped ? ["#EXT-X-ENDLIST"] : []),
    "",
  ].join("\n");

  fs.writeFileSync(playlistPath, playlist);
  console.log("📝 Updated playlist.m3u8 with durations");

  res.status(200).send("OK");
});

app.post("/stop", (req, res) => {
  recordingStopped = true;
  console.log(
    "⏹️ Recording stopped, future playlists will include EXT-X-ENDLIST"
  );
  res.status(200).send("Recording marked as stopped.");
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

  segmentMeta.length = 0;
  recordingStopped = false;

  console.log(`🧹 Reset done. Deleted ${deleted} files.`);
  res.status(200).send("Reset complete");
});

app.get("/playlist.m3u8", (req, res) => {
  if (segmentMeta.length === 0) {
    const tsFiles = fs
      .readdirSync(uploadDir)
      .filter((f) => f.endsWith(".ts"))
      .sort();

    if (tsFiles.length === 0) {
      return res
        .status(200)
        .setHeader("Content-Type", "application/vnd.apple.mpegurl")
        .send(
          [
            "#EXTM3U",
            "#EXT-X-VERSION:3",
            "#EXT-X-START:TIME-OFFSET=0",
            `#EXT-X-TARGETDURATION:${segmentDuration}`,
            "#EXT-X-MEDIA-SEQUENCE:0",
            "#EXT-X-ENDLIST",
          ].join("\n")
        );
    }

    const fallback = tsFiles.map((name) => ({
      filename: name,
      duration: segmentDuration,
    }));
    segmentMeta.push(...fallback);
  }

  const playlist = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-START:TIME-OFFSET=0",
    `#EXT-X-TARGETDURATION:${Math.ceil(
      Math.max(...segmentMeta.map((s) => s.duration), segmentDuration)
    )}`,
    "#EXT-X-MEDIA-SEQUENCE:0",
    ...segmentMeta.map(
      ({ filename, duration }) => `#EXTINF:${duration.toFixed(3)},\n${filename}`
    ),
    ...(recordingStopped ? ["#EXT-X-ENDLIST"] : []),
    "",
  ].join("\n");

  res
    .status(200)
    .setHeader("Content-Type", "application/vnd.apple.mpegurl")
    .send(playlist);
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
