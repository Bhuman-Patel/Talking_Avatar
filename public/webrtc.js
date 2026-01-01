// public/webrtc.js
import { exchangeSDP } from "./openai.js";
import { setupMic, monitorAudio } from "./audio.js";
import { drawAvatar } from "./lipsync.js";

let pc, dc;

export async function initWebRTC(log) {
  pc = new RTCPeerConnection();

  dc = pc.createDataChannel("oai-events");
  dc.onopen = () => {
    log("[dc] open");
    const el = document.getElementById("dcState");
    if (el) el.textContent = "open";
  };
  dc.onclose = () => {
    log("[dc] closed");
    const el = document.getElementById("dcState");
    if (el) el.textContent = "closed";
  };
  dc.onmessage = (e) => log(`[event] ${e.data}`);

  pc.onconnectionstatechange = () => {
    const el = document.getElementById("pcState");
    if (el) el.textContent = pc.connectionState;
  };
  pc.oniceconnectionstatechange = () => {
    const el = document.getElementById("iceState");
    if (el) el.textContent = pc.iceConnectionState;
  };

  const stream = await setupMic((level) => {
    drawAvatar(level);
    const micBar = document.getElementById("micBar");
    const micLevel = document.getElementById("micLevel");
    if (micBar) micBar.style.width = `${level * 100}%`;
    if (micLevel) micLevel.textContent = level.toFixed(2);
  });

  stream.getTracks().forEach((t) => pc.addTrack(t, stream));

  pc.ontrack = (e) => {
    const audio = document.getElementById("assistantAudio");
    if (audio) audio.srcObject = e.streams[0];

    const asstStatus = document.getElementById("asstStatus");
    if (asstStatus) asstStatus.textContent = "receiving";

    monitorAudio(e.streams[0], (v) => {
      const asstBar = document.getElementById("asstBar");
      if (asstBar) asstBar.style.width = `${v * 100}%`;
    });
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const answerSdp = await exchangeSDP(offer.sdp);

  await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

  log("[webrtc] connected");
}

export function sendTestPrompt() {
  dc?.send(
    JSON.stringify({
      type: "response.create",
      response: {
        output_modalities: ["audio"],
        instructions: "Say: Hello Bhuman — I can hear you. (one sentence only)"
      }
    })
  );
}


export function closeWebRTC() {
  try { dc?.close(); } catch {}
  try { pc?.close(); } catch {}
  dc = null;
  pc = null;
}
