// public/app.js
import { bindAssistantStreamForLipSync } from "./lipsync.js";

const connectBtn = document.getElementById("connectBtn");
const disconnectBtn = document.getElementById("disconnectBtn");
const testBtn = document.getElementById("testBtn");
const speakerBtn = document.getElementById("speakerBtn");

const micLevelEl = document.getElementById("micLevel");
const asstStatusEl = document.getElementById("asstStatus");
const logEl = document.getElementById("log");

const pcStateEl = document.getElementById("pcState");
const iceStateEl = document.getElementById("iceState");
const dcStateEl = document.getElementById("dcState");

const micBar = document.getElementById("micBar");
const assistantAudio = document.getElementById("assistantAudio");

const userSub = document.getElementById("userSub");
const asstSub = document.getElementById("asstSub");

let pc, dc, localStream;

function log(...args) {
  const line = args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  logEl.textContent = (logEl.textContent === "—" ? "" : logEl.textContent + "\n") + line;
  logEl.scrollTop = logEl.scrollHeight;
  console.log(...args);
}

function updateStates() {
  pcStateEl.textContent = pc?.connectionState ?? "—";
  iceStateEl.textContent = pc?.iceConnectionState ?? "—";
  dcStateEl.textContent = dc?.readyState ?? "—";
}

function startMicMeter(stream) {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);

  const data = new Uint8Array(analyser.fftSize);

  function rms() {
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
    micLevelEl.textContent = `rms=${v.toFixed(4)}`;
    const pct = Math.max(0, Math.min(100, v * 120));
    if (micBar) micBar.style.width = `${pct.toFixed(0)}%`;
    requestAnimationFrame(loop);
  }
  loop();
}

function sendEvent(obj) {
  if (!dc || dc.readyState !== "open") return;
  dc.send(JSON.stringify(obj));
}

// Always request an AUDIO response (this prevents “response with output_len=0” in many setups)
function requestAudioResponse(reason = "auto") {
  sendEvent({
    type: "response.create",
    response: {
      modalities: ["audio", "text"],
      voice: "alloy",
      instructions: reason === "test"
        ? "Say one short sentence out loud."
        : "Reply out loud in 1 short sentence."
    }
  });
  log(`[response.create] requested (${reason})`);
}

function playBeep() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.value = 880;
  gain.gain.value = 0.2;

  osc.connect(gain);
  gain.connect(ctx.destination);

  ctx.resume().then(() => {
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, 400);
  });
}

function wireDataChannel() {
  dc.addEventListener("open", () => {
    log("[dc] open");
    updateStates();
    testBtn.disabled = false;

    // Configure session (audio+text + voice) + make VAD less aggressive
    sendEvent({
      type: "session.update",
      session: {
        voice: "alloy",
        modalities: ["audio", "text"],
        turn_detection: { type: "server_vad", silence_duration_ms: 1400 },
        instructions: "You are a helpful voice assistant. Always speak your replies."
      }
    });

    // Auto test prompt (keeps your UI exactly the same)
    sendEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "Say: audio is working." }]
      }
    });
    requestAudioResponse("auto-test");
  });

  dc.addEventListener("message", (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }

    if (msg?.type) log("[evt]", msg.type);

    // Log errors explicitly
    if (msg.type === "error" || msg.error) {
      log("[ERROR]", msg);
    }

    // When the user's speech gets committed, request a response WITH audio
    if (msg.type === "input_audio_buffer.committed") {
      requestAudioResponse("committed");
    }

    // Log response output length so we can verify generation is happening
    if (msg.type === "response.created" || msg.type === "response.done") {
      const out = msg.response?.output;
      log("[RESP]", msg.type, "output_len=", Array.isArray(out) ? out.length : "n/a");
    }

    // Captions (keep your current behavior; we’ll enhance later)
    if (msg.transcript && msg.type?.includes("transcription")) {
      userSub.textContent = msg.transcript;
    }
    if (typeof msg.text === "string") {
      asstSub.textContent = msg.text;
    }
    if (typeof msg.delta === "string") {
      const cur = asstSub.textContent === "—" ? "" : asstSub.textContent;
      asstSub.textContent = cur + msg.delta;
    }
  });

  dc.addEventListener("close", () => {
    log("[dc] close");
    testBtn.disabled = true;
    updateStates();
  });

  dc.addEventListener("error", (e) => {
    log("[dc] error", String(e));
    updateStates();
  });
}

async function start() {
  connectBtn.disabled = true;
  connectBtn.textContent = "Connecting...";

  pc = new RTCPeerConnection();
  pc.onconnectionstatechange = updateStates;
  pc.oniceconnectionstatechange = updateStates;

  pc.ontrack = async (event) => {
    log("[webrtc] ontrack kind=", event.track.kind);
    if (event.track.kind !== "audio") return;

    const [remoteStream] = event.streams;

    const remoteTrack = remoteStream.getAudioTracks()[0];
    log("[audio-track] enabled=", remoteTrack.enabled, "muted=", remoteTrack.muted, "readyState=", remoteTrack.readyState);
    remoteTrack.onunmute = () => log("[audio-track] onunmute ✅ (frames arriving)");

    assistantAudio.srcObject = remoteStream;
    assistantAudio.muted = false;
    assistantAudio.volume = 1.0;

    asstStatusEl.textContent = "receiving track ✅";
    assistantAudio.onplaying = () => (asstStatusEl.textContent = "playing ✅");
    assistantAudio.onpause = () => (asstStatusEl.textContent = "paused");

    try {
      await assistantAudio.play();
      log("[audio] assistantAudio.play() OK");
    } catch (e) {
      log("[audio] play blocked:", String(e));
      asstStatusEl.textContent = "autoplay blocked (click again)";
    }

    // lipsync driven by remote stream analysis
    await bindAssistantStreamForLipSync(remoteStream);
  };

  dc = pc.createDataChannel("oai-events");
  wireDataChannel();
  updateStates();

  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  log("[mic] tracks:", localStream.getAudioTracks().map(t => t.label || "(unnamed)").join(", "));
  startMicMeter(localStream);

  localStream.getTracks().forEach((track) => {
    pc.addTransceiver(track, { direction: "sendrecv" });
  });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // Ephemeral session token from your worker
  const tokenResponse = await fetch("/session");
  const session = await tokenResponse.json();

  // helpful: log shape
  log("[session] keys=", Object.keys(session || {}));

  const EPHEMERAL_KEY = session?.result?.client_secret?.value;
  const modelFromServer = session?.result?.model;

  if (!EPHEMERAL_KEY) throw new Error("Missing session.result.client_secret.value from /session");

  const model = modelFromServer || "gpt-4o-realtime-preview-2024-12-17";
  log("[session-model]", model);

  const answerResp = await fetch(`https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`, {
    method: "POST",
    body: offer.sdp,
    headers: {
      Authorization: `Bearer ${EPHEMERAL_KEY}`,
      "Content-Type": "application/sdp",
    },
  });

  const answerSdp = await answerResp.text();
  if (!answerResp.ok) throw new Error(`Realtime SDP failed (${answerResp.status}): ${answerSdp}`);

  await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
  log("[webrtc] remote description set ✅");

  connectBtn.textContent = "Connected";
  disconnectBtn.disabled = false;
  testBtn.disabled = false;
  updateStates();
}

function disconnect() {
  try { dc?.close(); } catch {}
  try {
    pc?.getSenders()?.forEach(s => { try { s.track?.stop(); } catch {} });
    pc?.close();
  } catch {}
  try { localStream?.getTracks()?.forEach(t => t.stop()); } catch {}

  pc = null; dc = null; localStream = null;

  connectBtn.disabled = false;
  connectBtn.textContent = "Connect";
  disconnectBtn.disabled = true;
  testBtn.disabled = true;

  userSub.textContent = "—";
  asstSub.textContent = "—";
  asstStatusEl.textContent = "waiting";
  log("[webrtc] disconnected");
  updateStates();
}

function sendTestPrompt() {
  if (!dc || dc.readyState !== "open") return;
  asstSub.textContent = "";

  sendEvent({
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "Say a short hello and confirm you can speak audio." }],
    },
  });

  requestAudioResponse("test");
}

connectBtn.addEventListener("click", () => start().catch((err) => {
  console.error(err);
  log("[error]", String(err));
  connectBtn.disabled = false;
  connectBtn.textContent = "Connect";
  alert("Failed to connect. Check the log/console.");
}));

disconnectBtn.addEventListener("click", disconnect);
testBtn.addEventListener("click", sendTestPrompt);

if (speakerBtn) speakerBtn.addEventListener("click", playBeep);
