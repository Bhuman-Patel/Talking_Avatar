const canvas = document.getElementById("avatar");
const ctx = canvas.getContext("2d");

export function drawAvatar(level = 0) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#1e293b";
  ctx.beginPath();
  ctx.arc(210, 210, 180, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f87171";
  ctx.beginPath();
  ctx.ellipse(210, 280, 40, 8 + level * 30, 0, 0, Math.PI * 2);
  ctx.fill();
}

drawAvatar(0);
