// src/index.ts
import { Hono } from "hono";
import { cors } from "hono/cors";

type Env = {
  OPENAI_API_KEY: string;
};

const app = new Hono<{ Bindings: Env }>();
app.use("*", cors());

app.get("/session", async (c) => {
  const apiKey = c.env.OPENAI_API_KEY;
  if (!apiKey) return c.json({ error: "Missing OPENAI_API_KEY" }, 500);

  const resp = await fetch("https://api.openai.com/v1/realtime/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-realtime-preview-2024-12-17",
      voice: "alloy",
      modalities: ["audio", "text"],
      instructions: "You are a helpful voice assistant. Always reply with spoken audio.",
      turn_detection: { type: "server_vad", silence_duration_ms: 1400 },
    }),
  });

  const json = await resp.json();
  return c.json({ result: json }, resp.ok ? 200 : 500);
});

export default app;
