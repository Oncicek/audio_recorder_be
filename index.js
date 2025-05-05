import express from "express";
import fs from "fs";
import path from "path";
import cors from "cors";

const app = express();
const PORT = 3000;
const uploadDir = path.resolve("uploads");
const segmentDuration = 5;

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use(cors());
app.use(express.raw({ type: "*/*", limit: "10mb" }));
app.use(express.static(uploadDir));

const segmentMeta = []; // [{ filename, duration }]
let recordingStopped = false;

app.post("/upload", (req, res) => {
  const filename = req.headers["x-filename"];
  const duration = parseFloat(req.headers["x-duration"]);

  if (!filename || !filename.endsWith(".ts")) {
    return res.status(400).send("Only .ts segments are accepted");
  }

  const filepath = path.join(uploadDir, filename);
  fs.writeFileSync(filepath, req.body);
  console.log("✅ Saved segment:", filename);

  // Remove if already exists
  const existingIndex = segmentMeta.findIndex((s) => s.filename === filename);
  if (existingIndex !== -1) {
    segmentMeta.splice(existingIndex, 1);
  }

  segmentMeta.push({
    filename,
    duration: !isNaN(duration) ? duration : segmentDuration,
  });

  console.log("🧩 SegmentMeta now has", segmentMeta.length, "segments");
  res.status(200).send("OK");
});

app.get("/playlist.m3u8", (req, res) => {
  if (segmentMeta.length === 0) {
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

  const targetDuration = Math.ceil(
    Math.max(...segmentMeta.map((s) => s.duration), segmentDuration)
  );

  const playlist = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-START:TIME-OFFSET=0",
    `#EXT-X-TARGETDURATION:${targetDuration}`,
    "#EXT-X-MEDIA-SEQUENCE:0",
    ...segmentMeta.map(
      ({ filename, duration }) =>
        `#EXTINF:${Number(duration).toFixed(3)},\n${filename}`
    ),
    "#EXT-X-ENDLIST",
    "",
  ].join("\n");

  res
    .status(200)
    .setHeader("Content-Type", "application/vnd.apple.mpegurl")
    .send(playlist);
});

app.post("/reset", (req, res) => {
  let deleted = 0;
  for (const file of fs.readdirSync(uploadDir)) {
    if (file.endsWith(".ts") || file.endsWith(".m3u8")) {
      try {
        fs.unlinkSync(path.join(uploadDir, file));
        deleted++;
      } catch (e) {
        console.warn(`⚠️ Could not delete ${file}`);
      }
    }
  }

  segmentMeta.length = 0;
  recordingStopped = false;
  console.log(`🧹 Reset done. Deleted ${deleted} files.`);
  res.status(200).send("Reset done");
});

app.get("/segments", (req, res) => {
  fs.readdir(uploadDir, (err, files) => {
    if (err) return res.status(500).json({ error: "Cannot list files" });
    res.json(files.filter((f) => f.endsWith(".ts")).sort());
  });
});

app.get("/debug-playlist", (req, res) => {
  const playlist = segmentMeta
    .map((s, i) => `${i + 1}. ${s.filename} (${s.duration.toFixed(3)}s)`)
    .join("\n");

  res.setHeader("Content-Type", "text/plain");
  res.send(
    segmentMeta.length
      ? playlist
      : "No segment metadata available. Playlist will be empty."
  );
});

app.listen(PORT, () => {
  console.log(`🚀 HLS server running at http://localhost:${PORT}`);
});
