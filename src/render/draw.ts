/**
 * World-space drawing helpers. The world uses SI metres with y pointing up, and the
 * camera maps it onto the canvas. Glow uses a few additive strokes instead of
 * shadowBlur, which is very slow on mobile GPUs.
 */

export const C = {
  bg: '#070b12',
  bg2: '#0c1320',
  grid: 'rgba(80,140,200,0.08)',
  gridStrong: 'rgba(80,140,200,0.16)',
  steel: '#1a2636',
  steelEdge: '#3b5671',
  text: '#d9e6f2',
  dim: '#7f95ab',
  cyan: '#3ee6ff',
  magenta: '#ff4fd8',
  amber: '#ffb648',
  green: '#4dff9a',
  red: '#ff4d5e',
  violet: '#9d7bff',
  white: '#ffffff',
  glass: 'rgba(120,200,255,0.14)',
  glassEdge: 'rgba(150,220,255,0.55)',
};

export interface View { x: number; y: number; w: number; h: number }

export class Camera {
  scale = 1;
  ox = 0;
  oy = 0;
  /** extra user zoom/pan */
  zoom = 1;
  panX = 0;
  panY = 0;
  constructor(public view: View) {}
  fit(cssW: number, cssH: number, pad = 16, top = pad, bottom = pad): void {
    const availH = Math.max(40, cssH - top - bottom);
    const s = Math.min((cssW - pad * 2) / this.view.w, availH / this.view.h) * this.zoom;
    this.scale = s;
    const cx = this.view.x + this.view.w / 2 + this.panX;
    const cy = this.view.y + this.view.h / 2 + this.panY;
    this.ox = cssW / 2 - cx * s;
    this.oy = top + availH / 2 + cy * s;
  }
  X(x: number): number { return this.ox + x * this.scale; }
  Y(y: number): number { return this.oy - y * this.scale; }
  toWorld(px: number, py: number): { x: number; y: number } {
    return { x: (px - this.ox) / this.scale, y: (this.oy - py) / this.scale };
  }
}

export class Draw {
  constructor(public ctx: CanvasRenderingContext2D, public cam: Camera, public w: number, public h: number) {}

  clear(): void {
    const { ctx } = this;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  /** Background grid with a 1 m (or chosen) spacing and labelled major lines. */
  grid(step: number, unit = 'm', labelEvery = 5): void {
    const { ctx, cam } = this;
    const tl = cam.toWorld(0, 0), br = cam.toWorld(this.w, this.h);
    const x0 = Math.floor(tl.x / step) * step, x1 = br.x;
    const y0 = Math.floor(br.y / step) * step, y1 = tl.y;
    ctx.lineWidth = 1;
    let i = Math.round(x0 / step);
    for (let x = x0; x <= x1; x += step, i++) {
      ctx.strokeStyle = i % labelEvery === 0 ? C.gridStrong : C.grid;
      ctx.beginPath(); ctx.moveTo(cam.X(x), 0); ctx.lineTo(cam.X(x), this.h); ctx.stroke();
    }
    i = Math.round(y0 / step);
    for (let y = y0; y <= y1; y += step, i++) {
      ctx.strokeStyle = i % labelEvery === 0 ? C.gridStrong : C.grid;
      ctx.beginPath(); ctx.moveTo(0, cam.Y(y)); ctx.lineTo(this.w, cam.Y(y)); ctx.stroke();
    }
    void unit;
  }

  line(x1: number, y1: number, x2: number, y2: number, color: string, width = 2, dash?: number[]): void {
    const { ctx, cam } = this;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(cam.X(x1), cam.Y(y1));
    ctx.lineTo(cam.X(x2), cam.Y(y2));
    ctx.stroke();
    if (dash) ctx.setLineDash([]);
  }

  /** Polyline from parallel coordinate arrays (no allocation). */
  pathXY(xs: ArrayLike<number>, ys: ArrayLike<number>, n: number, color: string, width = 2, dash?: number[]): void {
    if (n < 2) return;
    const { ctx, cam } = this;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(cam.X(xs[0]), cam.Y(ys[0]));
    for (let i = 1; i < n; i++) ctx.lineTo(cam.X(xs[i]), cam.Y(ys[i]));
    ctx.stroke();
    if (dash) ctx.setLineDash([]);
  }

  path(pts: { x: number; y: number }[], color: string, width = 2, closed = false, fill?: string, dash?: number[]): void {
    if (pts.length < 2) return;
    const { ctx, cam } = this;
    ctx.beginPath();
    ctx.moveTo(cam.X(pts[0].x), cam.Y(pts[0].y));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(cam.X(pts[i].x), cam.Y(pts[i].y));
    if (closed) ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (width > 0) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      if (dash) ctx.setLineDash(dash);
      ctx.stroke();
      if (dash) ctx.setLineDash([]);
    }
  }

  /** Glowing polyline: wide faint halo, medium glow, bright core. */
  glowPath(pts: { x: number; y: number }[], color: string, core = 2.5): void {
    const { ctx } = this;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.12;
    this.path(pts, color, core * 6);
    ctx.globalAlpha = 0.3;
    this.path(pts, color, core * 2.6);
    ctx.globalAlpha = 1;
    this.path(pts, color, core);
    ctx.globalAlpha = 0.85;
    this.path(pts, C.white, Math.max(1, core * 0.4));
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  glowXY(xs: ArrayLike<number>, ys: ArrayLike<number>, n: number, color: string, core = 2.5): void {
    const { ctx } = this;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.14;
    this.pathXY(xs, ys, n, color, core * 5);
    ctx.globalAlpha = 1;
    this.pathXY(xs, ys, n, color, core);
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Circle with radius in pixels (r) at a world point. */
  dot(x: number, y: number, rPx: number, color: string, glow = false): void {
    const { ctx, cam } = this;
    const px = cam.X(x), py = cam.Y(y);
    if (glow) {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(px, py, 0, px, py, rPx * 4);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.arc(px, py, rPx * 4, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(px, py, rPx, 0, Math.PI * 2); ctx.fill();
  }

  ring(x: number, y: number, rPx: number, color: string, width = 2, dash?: number[]): void {
    const { ctx, cam } = this;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); ctx.arc(cam.X(x), cam.Y(y), rPx, 0, Math.PI * 2); ctx.stroke();
    if (dash) ctx.setLineDash([]);
  }

  /** Circle with radius in world units. */
  circleW(x: number, y: number, r: number, stroke: string | null, fill?: string, width = 2): void {
    const { ctx, cam } = this;
    ctx.beginPath(); ctx.arc(cam.X(x), cam.Y(y), Math.abs(r * cam.scale), 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }

  rect(x: number, y: number, w: number, h: number, fill: string | null, stroke?: string, width = 2): void {
    const { ctx, cam } = this;
    const px = cam.X(x), py = cam.Y(y + h), pw = w * cam.scale, ph = h * cam.scale;
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(px, py, pw, ph); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.strokeRect(px, py, pw, ph); }
  }

  /** A solid slab of lab hardware: dark fill with a lit top edge. */
  slab(x: number, y: number, w: number, h: number, edge = C.steelEdge): void {
    this.rect(x, y, w, h, C.steel);
    this.line(x, y + h, x + w, y + h, edge, 2);
  }

  text(x: number, y: number, s: string, sizePx = 14, color = C.text, align: CanvasTextAlign = 'center', base: CanvasTextBaseline = 'middle', offPx = 0, offPy = 0): void {
    const { ctx, cam } = this;
    ctx.font = `600 ${sizePx}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = base;
    ctx.fillText(s, cam.X(x) + offPx, cam.Y(y) + offPy);
  }

  /** Dimension line with arrows and a label, e.g. "Δx = 17.3 m". */
  dimension(x1: number, y1: number, x2: number, y2: number, label: string, offPx = 0, color = C.dim): void {
    const { ctx, cam } = this;
    const ax = cam.X(x1), ay = cam.Y(y1), bx = cam.X(x2), by = cam.Y(y2);
    const L = Math.hypot(bx - ax, by - ay) || 1;
    const nx = (-(by - ay) / L) * offPx, ny = ((bx - ax) / L) * offPx;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(ax + nx, ay + ny); ctx.lineTo(bx + nx, by + ny); ctx.stroke();
    ctx.setLineDash([]);
    const ux = (bx - ax) / L, uy = (by - ay) / L;
    for (const [px, py, s] of [[ax + nx, ay + ny, 1], [bx + nx, by + ny, -1]] as const) {
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + s * (ux * 8 - uy * 4), py + s * (uy * 8 + ux * 4));
      ctx.lineTo(px + s * (ux * 8 + uy * 4), py + s * (uy * 8 - ux * 4));
      ctx.closePath();
      ctx.fill();
    }
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const mx = (ax + bx) / 2 + nx * 1.9, my = (ay + by) / 2 + ny * 1.9;
    const tw = ctx.measureText(label).width + 10;
    ctx.fillStyle = 'rgba(7,11,18,0.85)';
    ctx.fillRect(mx - tw / 2, my - 10, tw, 20);
    ctx.fillStyle = color;
    ctx.fillText(label, mx, my);
  }

  /** Arrow in world coords. */
  arrow(x1: number, y1: number, x2: number, y2: number, color: string, width = 2): void {
    const { ctx, cam } = this;
    const ax = cam.X(x1), ay = cam.Y(y1), bx = cam.X(x2), by = cam.Y(y2);
    const L = Math.hypot(bx - ax, by - ay);
    if (L < 1) return;
    const ux = (bx - ax) / L, uy = (by - ay) / L;
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx - ux * 8, by - uy * 8); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx - ux * 10 - uy * 5, by - uy * 10 + ux * 5);
    ctx.lineTo(bx - ux * 10 + uy * 5, by - uy * 10 - ux * 5);
    ctx.closePath(); ctx.fill();
  }

  /** Field symbol grid: ⊙ (out of page) or ⊗ (into page) at spacing (world). */
  fieldSymbols(x: number, y: number, w: number, h: number, sign: number, spacing: number, color: string): void {
    if (sign === 0) return;
    const { ctx, cam } = this;
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.2;
    const r = Math.max(3, Math.min(7, spacing * cam.scale * 0.18));
    for (let gx = x + spacing / 2; gx < x + w; gx += spacing) {
      for (let gy = y + spacing / 2; gy < y + h; gy += spacing) {
        const px = cam.X(gx), py = cam.Y(gy);
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.stroke();
        if (sign > 0) { ctx.beginPath(); ctx.arc(px, py, r * 0.3, 0, Math.PI * 2); ctx.fill(); }
        else {
          ctx.beginPath();
          ctx.moveTo(px - r * 0.6, py - r * 0.6); ctx.lineTo(px + r * 0.6, py + r * 0.6);
          ctx.moveTo(px + r * 0.6, py - r * 0.6); ctx.lineTo(px - r * 0.6, py + r * 0.6);
          ctx.stroke();
        }
      }
    }
  }
}

/** Format a number in SI-friendly form, e.g. 2.0×10⁵. */
export function sci(v: number, digits = 2): string {
  if (v === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(v)));
  if (e >= -2 && e <= 3) return v.toFixed(Math.max(0, digits - 1 - Math.max(0, e)));
  const m = v / 10 ** e;
  const sup: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  return `${m.toFixed(digits - 1)}×10${String(e).split('').map((c) => sup[c]).join('')}`;
}
