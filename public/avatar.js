// public/avatar.js
const canvas = document.getElementById("avatar");
const ctx = canvas.getContext("2d");

let mouth = 6; // smoothed state

export function drawAvatar(targetMouth) {
  mouth = mouth * 0.75 + targetMouth * 0.25; // smoothing

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // head
  ctx.beginPath();
  ctx.arc(210, 200, 135, 0, Math.PI * 2);
  ctx.fillStyle = "#ffd7b5";
  ctx.fill();

  // eyes
  ctx.fillStyle = "#111";
  ctx.beginPath(); ctx.arc(160, 170, 10, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(260, 170, 10, 0, Math.PI * 2); ctx.fill();

  // mouth
  ctx.beginPath();
  ctx.ellipse(210, 275, 55, Math.max(6, mouth), 0, 0, Math.PI * 2);
  ctx.fillStyle = "#111";
  ctx.fill();
}
