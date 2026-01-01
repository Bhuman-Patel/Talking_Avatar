// src/index.ts
import { Hono } from "hono";
import { cors } from "hono/cors";

type Env = {
  OPENAI_API_KEY: string;
};

const app = new Hono<{ Bindings: Env }>();
app.use("*", cors());

// Browser POSTs SDP offer here
app.post("/session", async (c) => {
  const apiKey = c.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response("Missing OPENAI_API_KEY", { status: 500 });
  }

  const sdpOffer = await c.req.text();

  // IMPORTANT:
  // Do NOT include turn_detection here — this endpoint rejects session.turn_detection.
  // Configure turn detection from the browser via `session.update` instead.
  const sessionConfig = JSON.stringify({
    type: "realtime",
    model: "gpt-realtime",
    instructions: "You are a helpful voice assistant. Always speak your replies.",
    audio: {
      output: { voice: "alloy" }
    }
  });

  const fd = new FormData();
  fd.set("sdp", sdpOffer);
  fd.set("session", sessionConfig);

  const r = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: fd,
  });

  const bodyText = await r.text();

  if (!r.ok) {
    return new Response(bodyText, {
      status: r.status,
      headers: {
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  return new Response(bodyText, {
    status: 200,
    headers: {
      "Content-Type": "application/sdp",
      "Access-Control-Allow-Origin": "*",
    },
  });
});

export default app;
