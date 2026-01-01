export async function setupMic(onLevel) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  monitorAudio(stream, onLevel);
  return stream;
}

export function monitorAudio(stream, cb) {
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  src.connect(analyser);

  const buf = new Uint8Array(analyser.fftSize);

  function loop() {
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      sum += Math.abs(buf[i] - 128);
    }
    cb(Math.min(sum / buf.length / 40, 1));
    requestAnimationFrame(loop);
  }

  loop();
}
