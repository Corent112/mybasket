/**
 * tests/scene.cjs
 * ---------------------------------------------------------------------------
 * Générateur de scènes et de dégradations pour la batterie d'import.
 *
 * Une SCÈNE est décrite en coordonnées TERRAIN (u sur la largeur, v sur la
 * longueur, tous deux dans 0..1). C'est la vérité terrain : elle ne dépend ni du
 * cadrage, ni de la perspective, ni de la taille de l'image. On peut donc
 * dégrader l'image autant qu'on veut sans jamais perdre la référence.
 */

const { createCanvas, loadImage } = require("@napi-rs/canvas");

const MAROON = "#6B1A2C";
const GOLD = "#D4A24C";
const ORANGE = "#E8743C";

/* -------------------------------------------------------------------------- */
/* Rendu d'une scène, à plat                                                  */
/* -------------------------------------------------------------------------- */

function courtBox(kind, margin) {
  const width = 1000;
  const play = width - margin * 2;
  const length = Math.round((play * (kind === "full" ? 28 : 14)) / 15);
  return { W: width, H: length + margin * 2, x: margin, y: margin, w: play, h: length };
}

function drawHalfMarkings(ctx, box, flip) {
  const { x, y, w, h } = box;
  const baseY = flip ? y + h : y;
  const dir = flip ? -1 : 1;
  const Y = (m) => baseY + dir * (m / (box.lengthM || 14)) * h;
  const X = (m) => x + (m / 15) * w;
  const RX = (m) => (m / 15) * w;
  const RY = (m) => (m / (box.lengthM || 14)) * h;

  ctx.beginPath();
  ctx.rect(X(7.5 - 2.45), baseY, X(7.5 + 2.45) - X(7.5 - 2.45), dir * (Y(5.8) - baseY));
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(X(7.5), Y(5.8), RX(1.8), RY(1.8), 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(X(7.5), Y(1.575), RX(0.225), RY(0.225), 0, 0, Math.PI * 2);
  ctx.stroke();

  const straight = 1.575 + Math.sqrt(6.75 * 6.75 - 6.6 * 6.6);
  ctx.beginPath();
  ctx.moveTo(X(0.9), baseY);
  ctx.lineTo(X(0.9), Y(straight));
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(X(14.1), baseY);
  ctx.lineTo(X(14.1), Y(straight));
  ctx.stroke();

  ctx.save();
  ctx.translate(X(7.5), Y(1.575));
  ctx.scale(1, dir);
  ctx.beginPath();
  ctx.ellipse(0, 0, RX(6.75), RY(6.75), 0, 0.13, Math.PI - 0.13);
  ctx.stroke();
  ctx.restore();
}

function drawCourt(ctx, box, kind, style) {
  box.lengthM = kind === "full" ? 28 : 14;
  const { x, y, w, h } = box;

  if (style === "parquet") {
    for (let row = 0; row < h + 2 * y; row += 1) {
      const t = Math.sin(row * 0.7) * 10 + Math.sin(row * 0.13) * 14;
      ctx.fillStyle = `rgb(${Math.round(226 + t * 0.4)},${Math.round(166 + t * 0.5)},${Math.round(96 + t)})`;
      ctx.fillRect(0, row, box.W, 1);
    }
  }

  ctx.strokeStyle = style === "parquet" ? "#ffffff" : "#141414";
  ctx.lineWidth = Math.max(3, w * 0.005);
  ctx.lineJoin = "round";
  ctx.strokeRect(x, y, w, h);

  if (style === "parquet") {
    ctx.save();
    ctx.fillStyle = MAROON;
    const paintH = (5.8 / box.lengthM) * h;
    ctx.fillRect(x + w * 0.336, y, w * 0.327, paintH);
    if (kind === "full") ctx.fillRect(x + w * 0.336, y + h - paintH, w * 0.327, paintH);
    ctx.restore();
  }

  drawHalfMarkings(ctx, box, false);
  if (kind === "full") {
    drawHalfMarkings(ctx, box, true);
    ctx.beginPath();
    ctx.moveTo(x, y + h / 2);
    ctx.lineTo(x + w, y + h / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x + w * 0.5, y + h / 2, (1.8 / 15) * w, (1.8 / box.lengthM) * h, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.ellipse(x + w * 0.5, y + h, (1.8 / 15) * w, (1.8 / box.lengthM) * h, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawToken(ctx, box, player, style, tokens) {
  const x = box.x + box.w * player.u;
  const y = box.y + box.h * player.v;
  const R = Math.round(box.w * 0.026);
  const ink = style === "parquet" ? MAROON : "#141414";

  if (player.type === "defender" && tokens === "croix") {
    // Défenseur « en croix » : deux segments, aucun disque.
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(4, R * 0.42);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - R, y - R);
    ctx.lineTo(x + R, y + R);
    ctx.moveTo(x + R, y - R);
    ctx.lineTo(x - R, y + R);
    ctx.stroke();
    return;
  }

  if (player.type === "defender") {
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(5, R * 0.5);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - R * 0.45, y);
    ctx.bezierCurveTo(x - R * 1.4, y + R * 0.5, x - R * 2.4, y, x - R * 2.5, y - R * 1.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + R * 0.45, y);
    ctx.bezierCurveTo(x + R * 1.4, y + R * 0.5, x + R * 2.4, y, x + R * 2.5, y - R * 1.1);
    ctx.stroke();
  }

  if (tokens === "vide") {
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(4, R * 0.28);
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = ink;
  } else {
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = style === "parquet" ? GOLD : "#ffffff";
  }
  ctx.font = `bold ${Math.round(R * 1.15)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(player.label, x, y + 1);
}

function drawArrow(ctx, box, arrow, style) {
  const ink = style === "parquet" ? "#141414" : "#141414";
  const p = (point) => ({ x: box.x + box.w * point.u, y: box.y + box.h * point.v });
  const a = p(arrow.from);
  const b = p(arrow.to);
  const width = arrow.thickness || Math.max(3, box.w * 0.005);

  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = width;
  ctx.lineCap = "round";

  if (arrow.kind === "dribble") {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const waves = Math.max(4, Math.round(length / 26));
    ctx.beginPath();
    for (let i = 0; i <= 60; i += 1) {
      const t = i / 60;
      const nx = -(b.y - a.y) / length;
      const ny = (b.x - a.x) / length;
      const off = Math.sin(t * Math.PI * 2 * waves) * width * 2.4;
      const x = a.x + (b.x - a.x) * t + nx * off;
      const y = a.y + (b.y - a.y) * t + ny * off;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // pointe
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const head = Math.max(12, width * 4);
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - head * Math.cos(angle - 0.42), b.y - head * Math.sin(angle - 0.42));
  ctx.lineTo(b.x - head * Math.cos(angle + 0.42), b.y - head * Math.sin(angle + 0.42));
  ctx.closePath();
  ctx.fill();
}

function drawCone(ctx, box, cone) {
  const x = box.x + box.w * cone.u;
  const y = box.y + box.h * cone.v;
  const s = box.w * 0.018;
  ctx.fillStyle = ORANGE;
  ctx.beginPath();
  ctx.moveTo(x, y - s * 1.25);
  ctx.lineTo(x + s, y + s);
  ctx.lineTo(x - s, y + s);
  ctx.closePath();
  ctx.fill();
}

/** Rend une scène à plat et renvoie { canvas, boxes } (une box par dessin). */
function renderScene(scene) {
  const margin = 60;
  const base = courtBox(scene.kind, margin);
  const count = scene.drawings || 1;
  const W = base.W * count;
  const H = base.H + (scene.text ? 150 : 0);

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = scene.style === "parquet" ? MAROON : "#fdfcf8";
  ctx.fillRect(0, 0, W, H);

  const boxes = [];
  // Page SANS terrain : uniquement du texte. Cas de contrôle du garde-fou
  // « pas de terrain validé ⇒ aucun élément ».
  if (scene.noCourt) {
    ctx.fillStyle = "#141414";
    ctx.textAlign = "left";
    ctx.font = "bold 34px sans-serif";
    ctx.fillText("Title : Montee de balle 3c0", 60, 110);
    ctx.font = "24px sans-serif";
    ctx.fillText("Description : passe et suit, finir au panier.", 60, 170);
    ctx.fillText("Tips : rythme, appuis, main exterieure.", 60, 212);
    ctx.fillText("Players : 5   Cones : 2   Age group : U15", 60, 254);
    ctx.fillText("Variations : en surnombre, puis 3c2.", 60, 296);
    return { canvas, boxes: [], base };
  }
  for (let i = 0; i < count; i += 1) {
    const box = { ...base, W: base.W, x: base.x + i * base.W, y: base.y };
    ctx.save();
    if (scene.style === "parquet") {
      ctx.beginPath();
      ctx.rect(i * base.W, 0, base.W, base.H);
      ctx.clip();
      ctx.translate(i * base.W, 0);
      drawCourt(ctx, { ...base, x: base.x, y: base.y }, scene.kind, scene.style);
      ctx.restore();
      ctx.save();
      ctx.translate(i * base.W, 0);
    } else {
      ctx.translate(i * base.W, 0);
      drawCourt(ctx, { ...base, x: base.x, y: base.y }, scene.kind, scene.style);
    }
    const local = { ...base, x: base.x, y: base.y };
    // Deux schémas sur une page ne sont jamais identiques : on décale le second,
    // sinon le dédoublonnage par contenu le rejette — à juste titre.
    const shift = i * (scene.drawingShift ?? 0.06);
    for (const arrow of scene.arrows || []) {
      drawArrow(ctx, local, { ...arrow, from: { u: arrow.from.u, v: arrow.from.v + shift }, to: { u: arrow.to.u, v: arrow.to.v + shift } }, scene.style);
    }
    for (const cone of scene.cones || []) drawCone(ctx, local, { u: cone.u, v: cone.v + shift });
    for (const player of scene.players || []) {
      drawToken(ctx, local, { ...player, v: player.v + shift }, scene.style, scene.tokens || "plein");
    }
    ctx.restore();
    boxes.push(box);
  }

  if (scene.text) {
    ctx.fillStyle = scene.style === "parquet" ? "#ffffff" : "#141414";
    ctx.textAlign = "left";
    ctx.font = "bold 30px sans-serif";
    ctx.fillText("Title : Montee de balle 3c0", 40, base.H + 46);
    ctx.font = "22px sans-serif";
    ctx.fillText("Description : passe et suit, finir au panier.", 40, base.H + 86);
    ctx.fillText("Players : 5   Cones : 2   Age group : U15", 40, base.H + 120);
  }

  return { canvas, boxes, base };
}

/* -------------------------------------------------------------------------- */
/* Dégradations                                                               */
/* -------------------------------------------------------------------------- */

function boxBlur(canvas, radius) {
  if (!radius) return canvas;
  const ctx = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  const src = ctx.getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const i = (yy * w + xx) * 4;
          r += src.data[i]; g += src.data[i + 1]; b += src.data[i + 2]; n += 1;
        }
      }
      const o = (y * w + x) * 4;
      out.data[o] = r / n; out.data[o + 1] = g / n; out.data[o + 2] = b / n; out.data[o + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

/**
 * Transforme la scène à plat en « photo » : perspective, rotation, cadrage,
 * éclairage inégal, ombre portée, bruit, flou, compression JPEG.
 */
async function degrade(flat, options, homography) {
  const W = options.outWidth || 1500;
  const H = options.outHeight || 1150;
  const photo = createCanvas(W, H);
  const pctx = photo.getContext("2d");
  pctx.fillStyle = options.background || "#c9b79b";
  pctx.fillRect(0, 0, W, H);

  const quad = options.quad;
  const forward = homography.solveHomography(
    [
      { x: 0, y: 0 },
      { x: flat.width, y: 0 },
      { x: flat.width, y: flat.height },
      { x: 0, y: flat.height },
    ],
    quad
  );
  const back = homography.invert(forward);

  const fctx = flat.getContext("2d");
  const src = fctx.getImageData(0, 0, flat.width, flat.height);
  const out = pctx.getImageData(0, 0, W, H);

  const shadow = options.shadow || null;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const p = homography.applyHomography(back, { x: x + 0.5, y: y + 0.5 });
      const di = (y * W + x) * 4;
      let light = 1;
      if (options.light) {
        light = options.light.min + (options.light.max - options.light.min) * (x / W) * (1 - 0.35 * (y / H));
      }
      if (shadow && x > shadow.fromX * W && y > shadow.fromY * H) light *= shadow.factor;

      if (p.x < 0 || p.y < 0 || p.x > flat.width - 1 || p.y > flat.height - 1) {
        if (options.light || shadow) {
          for (let c = 0; c < 3; c += 1) {
            out.data[di + c] = Math.max(0, Math.min(255, out.data[di + c] * light));
          }
        }
        continue;
      }
      const sx = Math.round(p.x);
      const sy = Math.round(p.y);
      const si = (sy * flat.width + sx) * 4;
      const jitter = options.noise ? (Math.random() - 0.5) * options.noise : 0;
      for (let c = 0; c < 3; c += 1) {
        out.data[di + c] = Math.max(0, Math.min(255, src.data[si + c] * light + jitter));
      }
      out.data[di + 3] = 255;
    }
  }
  pctx.putImageData(out, 0, 0);

  let result = photo;
  if (options.blur) result = boxBlur(result, options.blur);

  if (options.scale && options.scale !== 1) {
    const small = createCanvas(Math.round(W * options.scale), Math.round(H * options.scale));
    const sctx = small.getContext("2d");
    sctx.imageSmoothingEnabled = true;
    sctx.drawImage(result, 0, 0, small.width, small.height);
    result = small;
  }

  if (options.jpeg) {
    const buffer = await result.encode("jpeg", options.jpeg);
    const image = await loadImage(buffer);
    const decoded = createCanvas(image.width, image.height);
    decoded.getContext("2d").drawImage(image, 0, 0);
    result = decoded;
  }

  return result;
}

/** Quadrilatère de destination : rectangle + perspective + rotation. */
function makeQuad({ cx, cy, w, h, rotationDeg = 0, perspective = 0, tilt = 0 }) {
  const corners = [
    { x: -w / 2, y: -h / 2 },
    { x: w / 2, y: -h / 2 },
    { x: w / 2, y: h / 2 },
    { x: -w / 2, y: h / 2 },
  ];
  // perspective : on rapproche le haut, on écarte le bas
  corners[0].x *= 1 - perspective;
  corners[1].x *= 1 - perspective;
  corners[0].y -= h * tilt;
  corners[1].y += h * tilt;
  const a = (rotationDeg * Math.PI) / 180;
  return corners.map((p) => ({
    x: cx + p.x * Math.cos(a) - p.y * Math.sin(a),
    y: cy + p.x * Math.sin(a) + p.y * Math.cos(a),
  }));
}

module.exports = { renderScene, degrade, makeQuad, courtBox };
