// public/lipsync.js
import { drawAvatar } from "./avatar.js";

const asstBar = document.getElementById("asstBar");

let audioCtx, analyser, data;

export async function bindAssistantStreamForLipSync(remoteStream) {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  data = new Uint8Array(analyser.fftSize);

  const src = audioCtx.createMediaStreamSource(remoteStream);
  src.connect(analyser);

  // Analysis only; playback is still via <audio>
  if (audioCtx.state !== "running") await audioCtx.resume();
}

function rms() {
  if (!analyser || !data) return 0;
  analyser.getByteTimeDomainData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / data.length);
}

function loop() {
  const v = rms();

  // avatar mouth
  const mouthOpen = Math.min(42, v * 170);
  drawAvatar(mouthOpen);

  // assistant meter
  if (asstBar) {
    const pct = Math.max(0, Math.min(100, v * 1200)); // aggressive scaling
    asstBar.style.width = `${pct.toFixed(0)}%`;
  }

  requestAnimationFrame(loop);
}
loop();
