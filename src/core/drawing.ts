import type { Balloon, Item, Panel, TextNode, Point } from './model';

export type DrawContext = CanvasRenderingContext2D;
export function panelPath(c: DrawContext, p: Pick<Panel, 'shape' | 'width' | 'height'>, begin = true) {
  const w = p.width,
    h = p.height;
  if (begin) c.beginPath();
  if (p.shape === 'oval') c.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, 2 * Math.PI);
  else if (p.shape === 'rounded') c.roundRect(0, 0, w, h, Math.min(24, w / 5, h / 5));
  else if (p.shape === 'diagonal') {
    c.moveTo(w * 0.09, 0);
    c.lineTo(w, 0);
    c.lineTo(w * 0.91, h);
    c.lineTo(0, h);
    c.closePath();
  } else c.rect(0, 0, w, h);
}
export function drawPanel(c: DrawContext, p: Panel) {
  if (p.role === 'spacer') return;
  c.save();
  c.globalAlpha *= p.opacity;
  panelPath(c, p);
  if (p.gradient) {
    const grad = c.createLinearGradient(0, 0, 0, p.height);
    grad.addColorStop(0, p.fill === 'transparent' ? '#ffffff00' : p.fill);
    grad.addColorStop(1, p.gradient === 'transparent' ? '#ffffff00' : p.gradient);
    c.fillStyle = grad;
    c.fill();
  } else if (p.fill !== 'transparent') {
    c.fillStyle = p.fill;
    c.fill();
  }
  if (p.strokeWidth > 0 && p.stroke !== 'transparent') {
    // Canvas strokes are centered on their path. Mask the inner half so the
    // configured thickness grows entirely outside the content boundary.
    const pad = p.strokeWidth + 2;
    c.save();
    c.beginPath();
    c.rect(-pad, -pad, p.width + pad * 2, p.height + pad * 2);
    panelPath(c, p, false);
    c.clip('evenodd');
    panelPath(c, p);
    c.lineWidth = p.strokeWidth * 2;
    c.strokeStyle = p.stroke;
    c.stroke();
    c.restore();
  }
  c.restore();
}
function bodyPoints(b: Balloon): Point[] {
  const points: Point[] = [],
    cx = b.width / 2,
    cy = b.height / 2,
    count = b.kind === 'shout' ? 40 : b.kind === 'thought' ? 120 : 96;
  const rounded = b.kind === 'rounded';
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    let factor = 1;
    if (b.kind === 'shout') factor = i % 2 === 0 ? 1.08 : 0.76;
    if (b.kind === 'electronic') factor = i % 4 < 2 ? 1 : 0.91;
    if (b.kind === 'thought') factor = 1 + 0.105 * Math.cos(a * 10) + 0.018 * Math.cos(a * 5 + 0.8);
    if (b.kind === 'wavy') factor = 1 + 0.025 * Math.sin(a * 15);
    const ca = Math.cos(a),
      sa = Math.sin(a);
    points.push({
      x: cx + cx * factor * (rounded ? Math.sign(ca) * Math.pow(Math.abs(ca), 0.35) : ca),
      y: cy + cy * factor * (rounded ? Math.sign(sa) * Math.pow(Math.abs(sa), 0.35) : sa),
    });
  }
  return points;
}
export function drawBalloon(c: DrawContext, b: Balloon) {
  c.save();
  c.lineWidth = b.strokeWidth;
  c.strokeStyle = b.stroke;
  c.fillStyle = b.fill === 'transparent' ? '#ffffff00' : b.fill;
  c.lineJoin = 'round';
  if (b.kind === 'caption') {
    c.beginPath();
    if (b.shape === 'rect') c.rect(0, 0, b.width, b.height);
    else c.roundRect(0, 0, b.width, b.height, Math.min(24, b.width / 8, b.height / 4));
    c.fill();
    if (b.strokeWidth && b.stroke !== 'transparent') c.stroke();
    c.restore();
    return;
  }
  const points = bodyPoints(b);
  if (b.kind === 'shout') {
    c.lineJoin = 'miter';
    c.miterLimit = 4;
  }
  if (b.kind === 'whisper') c.setLineDash([7, 6]);
  const tail =
    b.kind !== 'thought' && (b.tailX < 0 || b.tailY < 0 || b.tailX > b.width || b.tailY > b.height);
  let nearest = 0;
  if (tail) {
    let min = Infinity;
    points.forEach((p, i) => {
      const d = (p.x - b.tailX) ** 2 + (p.y - b.tailY) ** 2;
      if (d < min) {
        min = d;
        nearest = i;
      }
    });
  }
  c.beginPath();
  if (tail) {
    for (let k = 0; k <= points.length - 2; k++) {
      const p = points[(nearest + 1 + k) % points.length];
      if (k === 0) c.moveTo(p.x, p.y);
      else c.lineTo(p.x, p.y);
    }
    const start = points[(nearest + points.length - 1) % points.length];
    if (b.kind === 'electronic') {
      c.lineTo((start.x + b.tailX) / 2 + 10, (start.y + b.tailY) / 2);
      c.lineTo((start.x + b.tailX) / 2 - 5, (start.y + b.tailY) / 2 + 12);
    }
    c.lineTo(b.tailX, b.tailY);
  } else {
    points.forEach((p, i) => (i === 0 ? c.moveTo(p.x, p.y) : c.lineTo(p.x, p.y)));
  }
  c.closePath();
  c.fill();
  if (b.strokeWidth && b.stroke !== 'transparent') c.stroke();
  if (b.kind === 'thought') {
    const start = points.reduce((nearest, point) =>
      (point.x - b.tailX) ** 2 + (point.y - b.tailY) ** 2 <
      (nearest.x - b.tailX) ** 2 + (nearest.y - b.tailY) ** 2
        ? point
        : nearest,
    );
    [0.35, 0.67, 1].forEach((t, i) => {
      c.beginPath();
      c.arc(
        start.x + (b.tailX - start.x) * t,
        start.y + (b.tailY - start.y) * t,
        Math.max(3, 10 - i * 3),
        0,
        Math.PI * 2,
      );
      c.fill();
      if (b.strokeWidth) c.stroke();
    });
  }
  c.restore();
}
export function setFont(c: DrawContext, n: TextNode | Balloon) {
  c.font = `${n.italic ? 'italic ' : ''}${n.bold ? '700' : '400'} ${n.fontSize}px "Comic Neue"`;
}
export function wrapText(c: DrawContext, n: TextNode | Balloon) {
  setFont(c, n);
  const width = Math.max(1, n.width - 2 * n.padding);
  const lines: string[] = [];
  for (const paragraph of n.text.split('\n')) {
    if (!paragraph) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (c.measureText(next).width <= width) {
        line = next;
        continue;
      }
      if (line) {
        lines.push(line);
        line = '';
      }
      if (c.measureText(word).width <= width) {
        line = word;
        continue;
      }
      for (const ch of Array.from(word)) {
        if (line && c.measureText(line + ch).width > width) {
          lines.push(line);
          line = '';
        }
        line += ch;
      }
    }
    lines.push(line);
  }
  return lines;
}
export function textHeight(c: DrawContext, n: TextNode | Balloon) {
  return wrapText(c, n).length * n.fontSize * n.lineHeight + 2 * n.padding;
}
export function drawText(c: DrawContext, n: TextNode | Balloon) {
  c.save();
  const lines = wrapText(c, n),
    line = n.fontSize * n.lineHeight;
  c.fillStyle = n.textColor;
  c.textAlign = n.align;
  c.textBaseline = 'middle';
  const x = n.align === 'left' ? n.padding : n.align === 'right' ? n.width - n.padding : n.width / 2;
  const y = Math.max(n.padding, (n.height - lines.length * line) / 2) + line / 2;
  lines.forEach((text, i) => c.fillText(text, x, y + i * line));
  c.restore();
}
export function drawItem(c: DrawContext, n: Item, image?: CanvasImageSource) {
  c.save();
  c.globalAlpha *= n.opacity;
  if (n.type === 'image') {
    if (image) c.drawImage(image, 0, 0, n.width, n.height);
  } else {
    if (n.type === 'balloon') drawBalloon(c, n);
    drawText(c, n);
  }
  c.restore();
}
export function itemTransform(c: DrawContext, n: Item) {
  c.translate(n.x + n.width / 2, n.y + n.height / 2);
  c.rotate((n.rotation * Math.PI) / 180);
  c.scale(n.flipX ? -1 : 1, n.flipY ? -1 : 1);
  c.translate(-n.width / 2, -n.height / 2);
}
