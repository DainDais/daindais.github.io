// Draws the ID badge artwork (front, back, and lanyard strap) for the 3D lanyard.
// Edit BADGE below to change what's printed on the card.

export const BADGE = {
  name: "Dain Dais",
  school: "North Carolina Agricultural & Technical State University",
  major: "B.S. Information Technology",
  monogram: "DD",
  photo: "assets/img/headshot-badge.jpg",
};

const COLORS = {
  top: "#161b23",
  bottom: "#06080b",
  line: "rgba(148, 163, 184, 0.35)",
  grid: "rgba(148, 163, 184, 0.06)",
  name: "#e2e8f0",
  school: "#94a3b8",
  major: "#cbd5e1",
  accent: "#94a3b8",
};

// Same font as the rest of the site (the --font variable in styles.css).
const FONT =
  getComputedStyle(document.documentElement).getPropertyValue("--font").trim() ||
  'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// Design space for the card face, which is 0.7164 : 1 in 3D. The model's texture area for
// each face is narrower (0.662 : 1) and gets stretched ~8% sideways onto the card, so the
// artwork is drawn into a canvas squeezed by SQUEEZE to come out undistorted.
const W = 1146;
const H = 1600;
const SAFE_X = 110;
const SQUEEZE = 0.662 / 0.7164;

function faceCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(W * SQUEEZE);
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.scale(canvas.width / W, 1);
  return { canvas, ctx };
}

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

function cardBackground(ctx) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, COLORS.top);
  bg.addColorStop(1, COLORS.bottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Faint grid, echoing the site background.
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 2;
  for (let x = 0; x <= W; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // Inset border.
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(SAFE_X - 40, 150, W - 2 * (SAFE_X - 40), H - 220, 36);
  ctx.stroke();

  // Clip slot at the top.
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.beginPath();
  ctx.roundRect(W / 2 - 110, 70, 220, 38, 19);
  ctx.fill();
}

function wrapLines(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function drawFront(badge) {
  const { canvas, ctx } = faceCanvas();
  cardBackground(ctx);

  // Photo in a rounded square frame, cropped to fill (focused slightly above centre).
  const cx = W / 2;
  const size = 700;
  const radius = 56;
  const px = cx - size / 2;
  const py = 200;
  try {
    const photo = await loadImage(badge.photo);
    const scale = Math.max(size / photo.width, size / photo.height);
    const dw = photo.width * scale;
    const dh = photo.height * scale;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(px, py, size, size, radius);
    ctx.clip();
    ctx.fillStyle = "#5bb8e6";
    ctx.fillRect(px, py, size, size);
    ctx.drawImage(photo, cx - dw / 2, py - (dh - size) * 0.2, dw, dh);
    ctx.restore();
  } catch {
    /* no photo — leave the frame empty */
  }
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.roundRect(px - 9, py - 9, size + 18, size + 18, radius + 9);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = COLORS.name;
  ctx.font = `500 128px ${FONT}`;
  ctx.fillText(badge.name, cx, 1020);

  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(cx - 70, 1064, 140, 6);

  // School, then major — laid out so the last line stays inside the inner border.
  const maxWidth = W - 2 * SAFE_X - 40;
  ctx.font = `400 60px ${FONT}`;
  const schoolLines = wrapLines(ctx, badge.school, maxWidth);
  ctx.font = `500 68px ${FONT}`;
  const majorLines = wrapLines(ctx, badge.major, maxWidth);

  const SCHOOL_LINE = 66; // baseline-to-baseline
  const MAJOR_LINE = 76;
  const SCHOOL_TO_MAJOR = 112; // last school baseline to first major baseline
  const lastAllowed = 150 + (H - 220) - 70; // inner border bottom, minus padding

  const blockHeight =
    (schoolLines.length - 1) * SCHOOL_LINE + SCHOOL_TO_MAJOR + (majorLines.length - 1) * MAJOR_LINE;
  const top = Math.min(1140, lastAllowed - blockHeight); // move up if it would cross the border

  ctx.fillStyle = COLORS.school;
  ctx.font = `400 60px ${FONT}`;
  schoolLines.forEach((line, i) => ctx.fillText(line, cx, top + i * SCHOOL_LINE));

  const majorTop = top + (schoolLines.length - 1) * SCHOOL_LINE + SCHOOL_TO_MAJOR;
  ctx.fillStyle = COLORS.major;
  ctx.font = `500 68px ${FONT}`;
  majorLines.forEach((line, i) => ctx.fillText(line, cx, majorTop + i * MAJOR_LINE));

  return canvas.toDataURL("image/png");
}

function drawBack(badge) {
  const { canvas, ctx } = faceCanvas();
  cardBackground(ctx);

  const cx = W / 2;
  const cy = 780;
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, 250, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = COLORS.name;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `500 230px ${FONT}`;
  ctx.fillText(badge.monogram, cx, cy + 10);

  ctx.fillStyle = COLORS.school;
  ctx.font = `500 54px ${FONT}`;
  ctx.fillText(badge.name, cx, 1180);

  return canvas.toDataURL("image/png");
}

// Strap texture: plain dark band with edge stripes and dots, so it reads the same from either side.
function drawStrap() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#0b0e13";
  ctx.fillRect(0, 0, 1024, 256);
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(0, 22, 1024, 10);
  ctx.fillRect(0, 224, 1024, 10);
  for (let x = 64; x < 1024; x += 128) {
    ctx.beginPath();
    ctx.arc(x, 128, 14, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas.toDataURL("image/png");
}

export async function makeBadgeImages(badge = BADGE) {
  try {
    await Promise.all([
      document.fonts.load(`500 128px ${FONT}`),
      document.fonts.load(`500 54px ${FONT}`),
      document.fonts.load(`400 60px ${FONT}`),
    ]);
  } catch {
    /* fall back to system fonts */
  }
  const front = await drawFront(badge);
  return { front, back: drawBack(badge), strap: drawStrap() };
}
