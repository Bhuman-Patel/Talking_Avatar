// public/openai.js
export async function exchangeSDP(offerSdp) {
  const r = await fetch("/session", {
    method: "POST",
    headers: { "Content-Type": "application/sdp" },
    body: offerSdp
  });

  const t = await r.text();
  if (!r.ok) throw new Error(t);

  return t; // SDP answer
}
