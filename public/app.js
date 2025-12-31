import "./lipsync.js";

const connectBtn = document.getElementById("connectBtn");
const micLevelEl = document.getElementById("micLevel");
const asstStatusEl = document.getElementById("asstStatus");

let peerConnection;
let dataChannel;

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
    micLevelEl.textContent = v.toFixed(3);
    requestAnimationFrame(loop);
  }
  loop();
}

async function start() {
  connectBtn.disabled = true;
  connectBtn.textContent = "Connecting...";

  peerConnection = new RTCPeerConnection();

  // Confirm assistant audio is arriving
  peerConnection.ontrack = (event) => {
    console.log("✅ ontrack fired:", event.track.kind);
    const audioEl = document.getElementById("assistantAudio");
    audioEl.srcObject = event.streams[0];
    audioEl.play().then(() => console.log("✅ audio playing")).catch((e) => console.log("❌ play blocked", e));

    asstStatusEl.textContent = "receiving track ✅";

    const [remoteStream] = event.streams;
    audioEl.srcObject = remoteStream;

    audioEl.onplaying = () => (asstStatusEl.textContent = "playing ✅");
    audioEl.onpause = () => (asstStatusEl.textContent = "paused");
    audioEl.play().catch(() => {
      asstStatusEl.textContent = "autoplay blocked (click again)";
    });
  };

  dataChannel = peerConnection.createDataChannel("oai-events");

  dataChannel.addEventListener("open", () => {
    console.log("Data channel open");
    dataChannel.send(JSON.stringify({
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        instructions: "You are a friendly flight information voice assistant. Ask short clarifying questions when needed. Keep replies concise."

      }
    }));

    // IMPORTANT: request a response so you can hear audio back during testing
    dataChannel.send(JSON.stringify({ type: "response.create" }));
  });

  dataChannel.addEventListener("message", (ev) => {
    // For debugging:
    // console.log("DC message:", ev.data);
  });

  // Mic capture (this should trigger the browser mic indicator)
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  console.log("Mic tracks:", stream.getAudioTracks().map(t => t.label));
  startMicMeter(stream);

  stream.getTracks().forEach((track) =>
    peerConnection.addTransceiver(track, { direction: "sendrecv" })
  );

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  const tokenResponse = await fetch("/session");
  const data = await tokenResponse.json();
  const EPHEMERAL_KEY = data.result.client_secret.value;
  console.log("Ephemeral key received:", EPHEMERAL_KEY.slice(0, 10), "...");


  const baseUrl = "https://api.openai.com/v1/realtime";
  const model = "gpt-4o-realtime-preview-2024-12-17";

  const answerSdp = await fetch(`${baseUrl}?model=${model}`, {
    method: "POST",
    body: offer.sdp,
    headers: {
      Authorization: `Bearer ${EPHEMERAL_KEY}`,
      "Content-Type": "application/sdp",
    },
  }).then((r) => r.text());

  await peerConnection.setRemoteDescription({ type: "answer", sdp: answerSdp });

  connectBtn.textContent = "Connected";
}

connectBtn.addEventListener("click", () => {
  start().catch((err) => {
    console.error(err);
    connectBtn.disabled = false;
    connectBtn.textContent = "Connect";
    alert("Failed to connect. Check console.");
  });
});
