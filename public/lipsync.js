// public/lipsync.js
import { drawAvatar } from "./avatar.js";

const audioEl = document.getElementById("assistantAudio");
const asstBar = document.getElementById("asstBar");

let audioCtx, analyser, data;

function ensureAnalyser() {
  if (audioCtx) return;

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const src = audioCtx.createMediaElementSource(audioEl);

  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;

  src.connect(analyser);
  analyser.connect(audioCtx.destination);

  data = new Uint8Array(analyser.fftSize);
}

function rms() {
  if (!analyser) return 0;
  analyser.getByteTimeDomainData(data);

  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / data.length);
}

function loop() {
  const v = rms();                 // ~0..0.3 typical
  const mouthOpen = Math.min(42, v * 170);
  drawAvatar(mouthOpen);

  // assistant meter (0..100)
  const pct = Math.max(0, Math.min(100, (v * 10) * 100));
  if (asstBar) asstBar.style.width = `${pct.toFixed(0)}%`;

  requestAnimationFrame(loop);
}

audioEl.addEventListener("play", async () => {
  ensureAnalyser();
  if (audioCtx.state !== "running") await audioCtx.resume();
});

loop();
