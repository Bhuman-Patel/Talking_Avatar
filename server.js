// server.js
import "dotenv/config";
import express from "express";
import { fetch, FormData } from "undici";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

const DEFAULT_MODEL_CANDIDATES = [
  // try GA realtime models first
  "gpt-realtime",
  "gpt-5.2-pro",
  "gpt-realtime-mini",

  // fallbacks that are often available
  "gpt-4o-realtime",
  "gpt-5.2-pro",
  "gpt-4o-mini-realtime",
  "gpt-4o-realtime-preview",
  "gpt-4o-mini-realtime-preview",
  "gpt-4o-realtime-preview-2024-12-17",
];

async function listModels(apiKey) {
  const r = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j, null, 2));
  return (j.data || []).map((m) => m.id);
}

async function pickRealtimeModel(apiKey) {
  // If user pins a model in .env, use it (but still validate)
  const pinned = process.env.REALTIME_MODEL;
  const all = await listModels(apiKey);

  if (pinned) {
    if (all.includes(pinned)) return pinned;
    // allow partial match if OpenAI returns variant ids
    const maybe = all.find((m) => m === pinned || m.startsWith(pinned));
    if (maybe) return maybe;
  }

  // Try our candidate list
  for (const m of DEFAULT_MODEL_CANDIDATES) {
    const hit = all.find((x) => x === m || x.startsWith(m));
    if (hit) return hit;
  }

  // Last resort: pick any model id containing "realtime"
  const anyRealtime = all.find((x) => x.toLowerCase().includes("realtime"));
  if (anyRealtime) return anyRealtime;

  throw new Error("No realtime-capable model found on your API key. Check org/project access.");
}

// Debug endpoint: see what your key can access
app.get("/models", async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
    const models = await listModels(apiKey);
    res.json({ count: models.length, models });
  } catch (e) {
    res.status(500).send(String(e?.stack || e));
  }
});

// SDP exchange endpoint
app.post(
  "/session",
  express.text({ type: ["application/sdp", "text/plain"] }),
  async (req, res) => {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return res.status(500).send("Missing OPENAI_API_KEY in .env");

      const offerSdp = req.body;
      if (!offerSdp || typeof offerSdp !== "string") {
        return res.status(400).send("Missing SDP offer");
      }

      const model = await pickRealtimeModel(apiKey);

      const sessionConfig = {
        type: "realtime",
        model,
        instructions: "You are a helpful voice assistant. Always speak your replies.",
        audio: { output: { voice: "ash" } },
      };

      console.log("[/session] using model:", model);

      const fd = new FormData();
      fd.set("sdp", offerSdp);
      fd.set("session", JSON.stringify(sessionConfig));

      const r = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: fd,
      });

      const answerSdp = await r.text();

      if (!r.ok) {
        console.log("[/session] OpenAI error:", answerSdp);
        return res.status(r.status).send(answerSdp);
      }

      res.setHeader("Content-Type", "application/sdp");
      return res.status(200).send(answerSdp);
    } catch (e) {
      return res.status(500).send(String(e?.stack || e));
    }
  }
);

app.listen(PORT, () => console.log(`server running → http://localhost:${PORT}`));
