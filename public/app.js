import { initWebRTC, closeWebRTC, sendTestPrompt } from "./webrtc.js";

const logEl = document.getElementById("log");

function log(msg) {
  logEl.textContent += `\n${msg}`;
  logEl.scrollTop = logEl.scrollHeight;
}

document.getElementById("connectBtn").onclick = async () => {
  log("[ui] connecting...");
  await initWebRTC(log);
  document.getElementById("disconnectBtn").disabled = false;
  document.getElementById("testBtn").disabled = false;
};

document.getElementById("disconnectBtn").onclick = () => {
  closeWebRTC();
  log("[ui] disconnected");
};

document.getElementById("testBtn").onclick = () => {
  sendTestPrompt();
};

document.getElementById("speakerBtn").onclick = () => {
  const a = new AudioContext();
  const o = a.createOscillator();
  o.connect(a.destination);
  o.frequency.value = 880;
  o.start();
  setTimeout(() => o.stop(), 150);
};
