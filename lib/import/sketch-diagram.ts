import { courtToCanonical } from "./court-geometry";
import { rectifySketchOutline } from "./court-rectify";
import { ocrLandmarkGlyph } from "./ocr";
import type { AiDiagramAction, AiDiagramPlayer, AiPoint } from "./types";

type Region = { pixels: number[]; x0: number; x1: number; y0: number; y1: number };
const distance = (a: AiPoint, b: AiPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const widthOf = (part: Region) => part.x1 - part.x0 + 1;
const heightOf = (part: Region) => part.y1 - part.y0 + 1;
const centerOf = (part: Region) => ({ x: (part.x0 + part.x1) / 2, y: (part.y0 + part.y1) / 2 });

function regions(mask: Uint8Array, w: number, value: number) {
  const seen = new Uint8Array(mask.length);
  const result: Region[] = [];
  const diagonal = value ? [-w - 1, -w + 1, w - 1, w + 1] : [];
  const neighbors = [-w, -1, 1, w, ...diagonal];
  for (let i = 0; i < mask.length; i++) {
    if (seen[i] || mask[i] !== value) continue;
    const part = { pixels: [i], x0: w, x1: 0, y0: mask.length / w, y1: 0 };
    seen[i] = 1;
    for (let k = 0; k < part.pixels.length; k++) {
      const idx = part.pixels[k], x = idx % w, y = Math.floor(idx / w);
      part.x0 = Math.min(part.x0, x); part.x1 = Math.max(part.x1, x);
      part.y0 = Math.min(part.y0, y); part.y1 = Math.max(part.y1, y);
      for (const offset of neighbors) {
        const next = idx + offset;
        if (next < 0 || next >= mask.length || Math.abs(next % w - x) > 1 || seen[next] || mask[next] !== value) continue;
        seen[next] = 1;
        part.pixels.push(next);
      }
    }
    result.push(part);
  }
  return result;
}

export async function readSketchDiagram(source: HTMLCanvasElement) {
  const aligned = rectifySketchOutline(source);
  if (!aligned) return null;
  const work = document.createElement("canvas");
  const w = work.width = 560, h = work.height = 520;
  const border = 20, spanX = w - 2 * border, spanY = h - 2 * border;
  const context = work.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  const { canvas, play } = aligned;
  const expandX = border * (play.x1 - play.x0) / spanX;
  const expandY = border * (play.y1 - play.y0) / spanY;
  context.drawImage(canvas, play.x0 - expandX, play.y0 - expandY,
    play.x1 - play.x0 + 2 * expandX, play.y1 - play.y0 + 2 * expandY, 0, 0, w, h);
  const { data } = context.getImageData(0, 0, w, h);
  const light = new Uint8Array(w * h), integral = new Uint32Array((w + 1) * (h + 1));
  let color = 0;
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      const i = y * w + x, p = i * 4, hi = Math.max(data[p], data[p + 1], data[p + 2]);
      const lo = Math.min(data[p], data[p + 1], data[p + 2]);
      if (hi - lo > 40) color++;
      row += light[i] = (data[p] * 2 + data[p + 1] * 5 + data[p + 2]) / 8;
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + row;
    }
  }
  if (color > w * h * .12) return null;
  const at = (x: number, y: number) => y * w + x;
  const point = (index: number): AiPoint => ({ x: index % w, y: Math.floor(index / w) });
  const canonical = (p: AiPoint) => courtToCanonical({ x: (p.x - border) / spanX, y: (p.y - border) / spanY }, "half");
  const ink = light.map((value, index) => {
    const { x, y } = point(index), a = Math.max(0, x - 14), b = Math.min(w, x + 15);
    const top = Math.max(0, y - 14), bottom = Math.min(h, y + 15);
    const count = integral[bottom * (w + 1) + b] - integral[bottom * (w + 1) + a]
      - integral[top * (w + 1) + b] + integral[top * (w + 1) + a];
    const local = count / ((b - a) * (bottom - top));
    return value < 180 && value + 26 < local ? 1 : 0;
  });
  const grow = (mask: Uint8Array) => mask.map((value, i) =>
    value || mask[i - 1] || mask[i + 1] || mask[i - w] || mask[i + w] ? 1 : 0);
  const closed = grow(ink);
  const holes = [...regions(closed, w, 0), ...regions(grow(closed), w, 0)].filter(part =>
    widthOf(part) >= spanX * .023 && widthOf(part) <= spanX * .16 &&
    heightOf(part) >= spanY * .056 && heightOf(part) <= spanY * .19 &&
    part.pixels.length > widthOf(part) * heightOf(part) * .4);
  const tokens: Region[] = [];
  for (const hole of holes) {
    const point = centerOf(hole);
    if (tokens.some(token => distance(point, centerOf(token)) < 5)) continue;
    const neighbor = tokens.find(token => Math.min(token.y1, hole.y1) - Math.max(token.y0, hole.y0) > heightOf(hole) * .73
      && Math.max(token.x0 - hole.x1, hole.x0 - token.x1) < 6
      && Math.max(token.x1, hole.x1) - Math.min(token.x0, hole.x0) < spanX * .15);
    if (neighbor) {
      neighbor.x0 = Math.min(neighbor.x0, hole.x0); neighbor.x1 = Math.max(neighbor.x1, hole.x1);
      neighbor.y0 = Math.min(neighbor.y0, hole.y0); neighbor.y1 = Math.max(neighbor.y1, hole.y1);
    } else tokens.push(hole);
  }
  const roster: { player: AiDiagramPlayer; center: AiPoint; rx: number; ry: number }[] = [];
  for (const token of tokens.filter(part => widthOf(part) / heightOf(part) > .53).slice(0, 14)) {
    const center = centerOf(token), rx = widthOf(token) / 2 + 3, ry = heightOf(token) / 2 + 3;
    const glyphW = widthOf(token), glyphH = heightOf(token);
    const digitInk = new Uint8Array(glyphW * glyphH);
    for (let y = token.y0; y <= token.y1; y++) for (let x = token.x0; x <= token.x1; x++) {
      if (((x - center.x) / rx) ** 2 + ((y - center.y) / ry) ** 2 > .68 || !ink[at(x, y)]) continue;
      digitInk[(y - token.y0) * glyphW + x - token.x0] = 1;
    }
    const digit = regions(digitInk, glyphW, 1).sort((a, b) => b.pixels.length - a.pixels.length)[0];
    if (!digit || heightOf(digit) < glyphH * .32) continue;
    const digitW = widthOf(digit), digitH = heightOf(digit);
    const glyph = document.createElement("canvas");
    glyph.width = (digitW + 16) * 3;
    glyph.height = (digitH + 16) * 3;
    const draw = glyph.getContext("2d");
    if (!draw) continue;
    draw.fillStyle = "white"; draw.fillRect(0, 0, glyph.width, glyph.height);
    draw.fillStyle = "black";
    const rows = Array.from({ length: digitH }, () => [] as number[]);
    for (const pixel of digit.pixels) {
      const x = pixel % glyphW - digit.x0, y = Math.floor(pixel / glyphW) - digit.y0;
      rows[y].push(x);
      draw.fillRect((x + 8) * 3, (y + 8) * 3, 3, 3);
    }
    const rowBand = (lo: number, hi: number) => rows.slice(Math.floor(lo * digitH), Math.ceil(hi * digitH)).flat();
    const range = (lo: number, hi: number) => {
      const band = rowBand(lo, hi);
      return { left: Math.min(...band) / digitW, right: Math.max(...band) / digitW };
    };
    const top = range(0, .22), upper = range(.31, .39), lower = range(.64, .78), foot = range(.85, 1);
    const word = await ocrLandmarkGlyph(glyph, false, true);
    const single = !word || word.confidence < .78 ? await ocrLandmarkGlyph(glyph, true, true) : null;
    const read = single && (!word || single.confidence > word.confidence) ? single : word;
    const one = top.right - top.left < .23 && lower.right - lower.left < .22 && foot.right - foot.left > .53
      && Math.abs(top.right - lower.right) < .2;
    const three = digitW / digitH < .56 && upper.left < .24 && lower.left > .55 &&
      top.left < .56 && foot.right < .92;
    const two = read?.text === "2" && top.right > .67 && upper.left > .54 && lower.right < .65 && foot.left < .25;
    const five = top.left < .36 && top.right > .58 && upper.right < .56 && lower.left > .38
      && lower.right > .77 && foot.left < .24 && foot.right > .7;
    const shape = one ? "1" : two ? "2" : three ? "3" : five ? "5" : "";
    const label = shape && (three || !read || read.confidence < .72 || read.text === shape) ? shape
      : read && read.confidence >= .39 ? read.text : "";
    if (!label && (center.y < border || center.y > h - border || center.x < border || center.x > w - border)) continue;
    roster.push({ center, rx, ry, player: { ...canonical(center), key: `papier-${roster.length + 1}`, label,
      team: "att", type: "attacker", shape: "circle", confidence: label ? .85 : .48,
      labelConfident: !!label, source: "Jeton manuscrit repéré à l’intérieur du terrain" } });
  }
  if (roster.filter(item => item.player.labelConfident).length < 2) return null;
  const isMasked = (p: AiPoint) => roster.some(token =>
    ((p.x - token.center.x) / (token.rx + 5)) ** 2 + ((p.y - token.center.y) / (token.ry + 5)) ** 2 < 1);
  const arrowInk = ink.map((value, index) => {
    if (!value) return 0;
    const p = point(index);
    const margin = 11;
    return p.x >= border + margin && p.x < w - border - margin &&
      p.y >= border + margin && p.y < h - border - margin && !isMasked(p) ? 1 : 0;
  });
  const strokes = regions(arrowInk, w, 1).filter(part => part.pixels.length >= 7);
  // The three-point arc has two high shoulders and a low centre. Its
  // dimensions are measured on the drawing; they need not match the rules.
  const arc = strokes.find(part => widthOf(part) > spanX * .55 && heightOf(part) > spanY * .24
    && part.y0 < border + spanY * .12 && part.y1 < border + spanY * .8
    && part.pixels.some(i => i % w < part.x0 + widthOf(part) * .14 && point(i).y < part.y0 + heightOf(part) * .13)
    && part.pixels.some(i => i % w > part.x1 - widthOf(part) * .14 && point(i).y < part.y0 + heightOf(part) * .13));
  if (!arc) return null;
  // Look for the two sides of the key as a pair. A line on one side alone
  // might be a cut by a player close to the baseline.
  const rails = strokes.filter(part => part !== arc && part.y0 < border + spanY * .13
    && heightOf(part) > spanY * .075 && heightOf(part) > widthOf(part) * 4);
  const pairs = rails.flatMap(left => rails.flatMap(right => {
    const l = centerOf(left).x, r = centerOf(right).x;
    if (l > w / 2 || r < w / 2 || r-l < spanX * .12 || r-l > spanX * .46 ||
      Math.abs((l+r)/2-w/2) > spanX * .09) return [];
    return [{ left, right }];
  }));
  const key = pairs.length === 1 ? pairs[0] : undefined;
  const candidates = strokes.filter(part => part !== arc && part !== key?.left && part !== key?.right);
  const actions: AiDiagramAction[] = [];
  const used = new Set<Region>();
  const movements: { action: AiDiagramAction; end: AiPoint }[] = [];
  const nearest = (pixels: number[], target: AiPoint) => pixels.reduce((best, i) =>
    distance(point(i), target) < distance(point(best), target) ? i : best);
  const follow = (part: Region, start: number) => {
    const pixels = new Set(part.pixels);
    const parents = new Map([[start, start]]), queue = [start];
    for (let k = 0; k < queue.length; k++) {
      const pixel = queue[k];
      for (const offset of [-w-1, -w, -w+1, -1, 1, w-1, w, w+1]) {
        const next = pixel + offset;
        if (!pixels.has(next) || parents.has(next)) continue;
        parents.set(next, pixel); queue.push(next);
      }
    }
    const tip = queue[queue.length - 1], route = [];
    for (let pixel = tip; pixel !== start; pixel = parents.get(pixel)!) route.push(point(pixel));
    route.push(point(start));
    return route.reverse();
  };
  const thick = (p: AiPoint) => {
    let count = 0;
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
      if (x*x + y*y <= 10 && arrowInk[at(p.x + x, p.y + y)]) count++;
    }
    return count;
  };
  const zigzags = (route: AiPoint[]) => {
    const first = route[0], last = route[route.length - 1];
    const span = distance(first, last);
    let extreme = 0, direction = 0, turns = 0;
    for (const p of route) {
      const cross = ((last.x-first.x)*(p.y-first.y)-(last.y-first.y)*(p.x-first.x))/span;
      if (direction > 0) extreme = Math.max(extreme, cross);
      if (direction < 0) extreme = Math.min(extreme, cross);
      if (cross > extreme + spanX * .007) { if (direction < 0) turns++; direction = 1; extreme = cross; }
      if (cross < extreme - spanX * .007) { if (direction > 0) turns++; direction = -1; extreme = cross; }
    }
    return turns;
  };
  for (const part of candidates) {
    if (Math.hypot(widthOf(part), heightOf(part)) < spanX * .1) continue;
    const starts = roster.map(item => {
      const pixel = nearest(part.pixels, item.center);
      const p = point(pixel);
      const normalized = Math.hypot((p.x-item.center.x)/(item.rx+6),(p.y-item.center.y)/(item.ry+6));
      return { item, pixel, normalized };
    }).filter(start => start.normalized < 1.27).sort((a, b) => a.normalized - b.normalized);
    if (!starts.length || starts[1] && starts[1].normalized - starts[0].normalized < .18) continue;
    const { item, pixel } = starts[0];
    const route = follow(part, pixel), end = route[route.length - 1];
    if (distance(route[0], end) < spanX * .09 || distance(item.center, end) < spanX * .13) continue;
    const terminal = route.slice(-18);
    const head = Math.max(...terminal.map(thick));
    const body = route.slice(12, -20).map(thick).sort((a, b) => a - b);
    const shaft = body[Math.floor(body.length * .66)] ?? head;
    if (head < 17 || head < shaft * 1.12) continue;
    const kind = zigzags(route) >= 4 ? "dribble" : "cut";
    const action: AiDiagramAction = { action: kind, from: item.player, to: canonical(end), fromPlayer: item.player.key,
      points: [item.player, ...route.filter((_, index) => index % 3 === 0).map(canonical), canonical(end)],
      confidence: .78, source: kind === "dribble" ? "Zigzag manuscrit et pointe de flèche" : "Trait manuscrit continu et pointe de flèche" };
    actions.push(action); movements.push({ action, end }); used.add(part);
  }

  const detached = candidates.filter(part => !used.has(part) && Math.hypot(widthOf(part), heightOf(part)) < spanX * .053);
  const origins = [
    ...roster.map(item => ({ from: item.center, player: item.player, move: undefined as AiDiagramAction | undefined })),
    ...movements.filter(({ action }) => action.action === "dribble").flatMap(({ action, end }) => {
      const player = roster.find(item => item.player.key === action.fromPlayer)?.player;
      return player ? [{ from: end, player, move: action }] : [];
    }),
  ];
  for (const head of detached.filter(part => part.pixels.length > 55 && part.pixels.some(i => thick(point(i)) >= 18))) {
    const center = centerOf(head);
    const matches = origins.flatMap(origin => {
      const length = distance(origin.from, center);
      if (length < spanX * .12) return [];
      const dx = (center.x-origin.from.x)/length, dy = (center.y-origin.from.y)/length;
      const dashes = detached.filter(part => part !== head && part.pixels.length < head.pixels.length * .67)
        .map(part => {
          const p = centerOf(part), x = p.x - origin.from.x, y = p.y - origin.from.y;
          return { along: x*dx + y*dy, cross: Math.abs(y*dx - x*dy) };
        }).filter(mark => mark.cross < spanX * .025 && mark.along > spanX * .015 && mark.along < length - 7)
        .sort((a,b) => a.along-b.along);
      if (dashes.length < 3 || length - dashes[dashes.length - 1].along > spanX * .09 ||
        dashes[0].along > (origin.move ? spanX * .075 : spanX * .16)) return [];
      const gaps = dashes.slice(1).map((mark, index) => mark.along - dashes[index].along);
      const regular = gaps.filter(gap => gap > spanX * .02 && gap < spanX * .082);
      if (regular.length < 2 || regular.length < gaps.length * .7) return [];
      return [{ origin, dx, dy, score: regular.length - dashes.reduce((sum, mark) => sum + mark.cross, 0) / spanX }];
    }).sort((a,b) => b.score-a.score);
    const match = matches[0];
    if (!match || matches[1] && match.score - matches[1].score < .5) continue;
    const { origin, dx, dy } = match;
    const tip = head.pixels.map(point).reduce((best, p) => p.x*dx + p.y*dy > best.x*dx + best.y*dy ? p : best);
    const targets = roster.filter(item => item.player.key !== origin.player.key).map(item => {
      const move = movements.find(movement => movement.action.fromPlayer === item.player.key);
      return { item, move, gap: distance(tip, move?.end ?? item.center) };
    }).sort((a,b) => a.gap-b.gap);
    const target = targets[0] && targets[0].gap < spanX * .07 &&
      (!targets[1] || targets[1].gap - targets[0].gap > spanX * .034) ? targets[0] : undefined;
    actions.push({ action: "pass", from: origin.move?.to ?? origin.player, to: canonical(tip),
      fromPlayer: origin.player.key, toPlayer: target?.item.player.key, confidence: target ? .8 : .47,
      source: target ? "Pointillés vers l’arrivée du partenaire" : "Passe en pointillés : réception à confirmer" });
  }
  // A drawn ball is a compact dark mark next to its player's circle.
  for (const item of roster) {
    const found = candidates.some(part => !used.has(part) && widthOf(part) < spanX * .055 && heightOf(part) < spanX * .055
      && part.pixels.length > 60 && part.pixels.length > widthOf(part)*heightOf(part)*.33
      && distance(centerOf(part),item.center) < Math.max(item.rx,item.ry)*1.6);
    if (found) item.player.hasBall = true;
  }
  return { ...aligned, players: roster.map(item => item.player), actions };
}
