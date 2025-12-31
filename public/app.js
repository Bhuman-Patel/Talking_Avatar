// public/app.js
const connectBtn = document.getElementById("connectBtn");
const disconnectBtn = document.getElementById("disconnectBtn");
const testBtn = document.getElementById("testBtn");

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

let peerConnection;
let dataChannel;
let localStream;

function log(...args) {
  const line = args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  logEl.textContent = (logEl.textContent === "—" ? "" : logEl.textContent + "\n") + line;
  logEl.scrollTop = logEl.scrollHeight;
  console.log(...args);
}

function updateStates() {
  pcStateEl.textContent = peerConnection?.connectionState ?? "—";
  iceStateEl.textContent = peerConnection?.iceConnectionState ?? "—";
  dcStateEl.textContent = dataChannel?.readyState ?? "—";
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
  if (!dataChannel || dataChannel.readyState !== "open") return;
  dataChannel.send(JSON.stringify(obj));
}

function wireDataChannel() {
  dataChannel.addEventListener("open", () => {
    log("[dc] open");
    updateStates();
    testBtn.disabled = false;

    // Tell the session we want audio + text, and enable server VAD
    sendEvent({
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        turn_detection: { type: "server_vad" },
        instructions: "You are a helpful voice assistant. Keep replies concise and natural."
      }
    });

    // Don’t auto-trigger response.create here (it can produce silence if there’s no user input yet).
    // We'll use the test button to force a reply during debugging.
  });

  dataChannel.addEventListener("message", (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg?.type) log("[evt]", msg.type);

      // Basic transcript surfacing (we’ll refine later)
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
    } catch {
      // Non-JSON events
      // log("[dc] message:", ev.data);
    }
  });

  dataChannel.addEventListener("close", () => {
    log("[dc] close");
    updateStates();
    testBtn.disabled = true;
  });

  dataChannel.addEventListener("error", (e) => {
    log("[dc] error", String(e));
    updateStates();
  });
}

async function start() {
  connectBtn.disabled = true;
  connectBtn.textContent = "Connecting...";

  // Create PC
  peerConnection = new RTCPeerConnection();
  peerConnection.onconnectionstatechange = updateStates;
  peerConnection.oniceconnectionstatechange = updateStates;

  // Remote audio
  peerConnection.ontrack = (event) => {
    log("[webrtc] ontrack kind=", event.track.kind);
    if (event.track.kind !== "audio") return;

    const [remoteStream] = event.streams;
    assistantAudio.srcObject = remoteStream;

    asstStatusEl.textContent = "receiving track ✅";
    assistantAudio.onplaying = () => (asstStatusEl.textContent = "playing ✅");
    assistantAudio.onpause = () => (asstStatusEl.textContent = "paused");

    assistantAudio.play().then(() => {
      log("[audio] assistantAudio.play() OK");
    }).catch((e) => {
      log("[audio] play blocked:", String(e));
      asstStatusEl.textContent = "autoplay blocked (click again)";
    });
  };

  // Data channel
  dataChannel = peerConnection.createDataChannel("oai-events");
  wireDataChannel();
  updateStates();

  // Mic capture
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  log("[mic] tracks:", localStream.getAudioTracks().map(t => t.label || "(unnamed)").join(", "));
  startMicMeter(localStream);

  // Send mic to peer
  localStream.getTracks().forEach((track) => {
    peerConnection.addTransceiver(track, { direction: "sendrecv" });
  });

  // Offer
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  // Get ephemeral key from server
  const tokenResponse = await fetch("/session");
  const session = await tokenResponse.json();

  // NOTE: your current code expects: data.result.client_secret.value
  const EPHEMERAL_KEY = session?.result?.client_secret?.value;
  if (!EPHEMERAL_KEY) {
    throw new Error("Missing session.result.client_secret.value from /session");
  }

  const baseUrl = "https://api.openai.com/v1/realtime";
  const model = "gpt-4o-realtime-preview-2024-12-17";

  // Exchange SDP
  const answerResp = await fetch(`${baseUrl}?model=${encodeURIComponent(model)}`, {
    method: "POST",
    body: offer.sdp,
    headers: {
      Authorization: `Bearer ${EPHEMERAL_KEY}`,
      "Content-Type": "application/sdp",
    },
  });

  const answerSdp = await answerResp.text();
  if (!answerResp.ok) {
    throw new Error(`Realtime SDP failed (${answerResp.status}): ${answerSdp}`);
  }

  await peerConnection.setRemoteDescription({ type: "answer", sdp: answerSdp });

  connectBtn.textContent = "Connected";
  disconnectBtn.disabled = false;
  log("[webrtc] remote description set ✅");
  updateStates();
}

function disconnect() {
  try { dataChannel?.close(); } catch {}
  try {
    peerConnection?.getSenders()?.forEach(s => { try { s.track?.stop(); } catch {} });
    peerConnection?.close();
  } catch {}

  try { localStream?.getTracks()?.forEach(t => t.stop()); } catch {}

  peerConnection = null;
  dataChannel = null;
  localStream = null;

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

// Forces the model to respond (audio + text) even if VAD/turn detection didn’t trigger.
function sendTestPrompt() {
  if (!dataChannel || dataChannel.readyState !== "open") return;

  asstSub.textContent = "";
  sendEvent({
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "Say a short hello and confirm you can speak audio." }]
    }
  });

  sendEvent({
    type: "response.create",
    response: { modalities: ["audio", "text"] }
  });

  log("[test] sent conversation.item.create + response.create");
}

connectBtn.addEventListener("click", () => {
  start().catch((err) => {
    console.error(err);
    log("[error]", String(err));
    connectBtn.disabled = false;
    connectBtn.textContent = "Connect";
    alert("Failed to connect. Check the log/console.");
  });
});

disconnectBtn.addEventListener("click", disconnect);
testBtn.addEventListener("click", sendTestPrompt);
