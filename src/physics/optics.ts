/**
 * 2D geometric-optics ray tracer.
 *  - Plane mirrors: exact reflection (angle of incidence = angle of reflection).
 *  - Spherical mirrors: exact intersection with the true circular arc, then
 *    reflection about the local normal. Paraxial rays obey 1/v + 1/u = 2/R, and
 *    wide rays show real spherical aberration.
 *  - Thin lenses: ideal thin lens, tan θ_out = tan θ_in − y/f, which gives
 *    1/v − 1/u = 1/f exactly.
 *  - Refracting polygons (slabs, prisms): Snell's law n₁ sin i = n₂ sin r at
 *    every face, with total internal reflection when sin r would exceed 1.
 */

export interface Vec { x: number; y: number }

export type OpticalElement =
  | { kind: 'mirror'; id: string; x: number; y: number; length: number; angle: number }
  | { kind: 'curvedMirror'; id: string; x: number; y: number; angle: number; radius: number; aperture: number }
  | { kind: 'lens'; id: string; x: number; y: number; angle: number; height: number; focal: number }
  | { kind: 'block'; id: string; points: Vec[]; n: number }
  | { kind: 'wall'; id: string; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'target'; id: string; x1: number; y1: number; x2: number; y2: number };

export interface Ray { x: number; y: number; dx: number; dy: number }

export interface TraceResult {
  points: Vec[];
  hitTarget: string | null;
  /** Ids of elements the beam touched, in order. */
  touched: string[];
  /** Where total internal reflection happened. */
  tirPoints: Vec[];
  escaped: boolean;
}

const EPS = 1e-9;

export function reflect(dx: number, dy: number, nx: number, ny: number): [number, number] {
  const d = dx * nx + dy * ny;
  return [dx - 2 * d * nx, dy - 2 * d * ny];
}

/**
 * Refract direction (unit) through a surface with unit normal n pointing toward
 * the incoming side. Returns null on total internal reflection.
 */
export function refract(dx: number, dy: number, nx: number, ny: number, n1: number, n2: number): [number, number] | null {
  let cosi = -(dx * nx + dy * ny);
  if (cosi < 0) { nx = -nx; ny = -ny; cosi = -cosi; }
  const eta = n1 / n2;
  const k = 1 - eta * eta * (1 - cosi * cosi);
  if (k < 0) return null;
  const c = eta * cosi - Math.sqrt(k);
  return [eta * dx + c * nx, eta * dy + c * ny];
}

/** Ray vs segment: returns distance t along ray and segment parameter s, or null. */
function raySeg(r: Ray, x1: number, y1: number, x2: number, y2: number): { t: number; s: number } | null {
  const ex = x2 - x1, ey = y2 - y1;
  const den = r.dx * ey - r.dy * ex;
  if (Math.abs(den) < 1e-14) return null;
  const wx = x1 - r.x, wy = y1 - r.y;
  const t = (wx * ey - wy * ex) / den;
  const s = (wx * r.dy - wy * r.dx) / den;
  if (t <= EPS || s < 0 || s > 1) return null;
  return { t, s };
}

function segEnds(x: number, y: number, length: number, angle: number): [number, number, number, number] {
  const hx = (Math.cos(angle) * length) / 2, hy = (Math.sin(angle) * length) / 2;
  return [x - hx, y - hy, x + hx, y + hy];
}

/**
 * Curved mirror geometry: the vertex is at (x, y), and `angle` is the direction the
 * reflecting face points (toward incoming light). The centre of curvature lies at
 * vertex + R·(cos angle, sin angle). R > 0 is concave (converging), R < 0 is convex.
 * `aperture` is the chord height.
 */
export function curvedMirrorCenter(m: Extract<OpticalElement, { kind: 'curvedMirror' }>): Vec {
  return { x: m.x + m.radius * Math.cos(m.angle), y: m.y + m.radius * Math.sin(m.angle) };
}

interface Hit { t: number; nx: number; ny: number; el: OpticalElement; s?: number; edgeIndex?: number }

function intersect(r: Ray, el: OpticalElement): Hit | null {
  switch (el.kind) {
    case 'mirror': {
      const [x1, y1, x2, y2] = segEnds(el.x, el.y, el.length, el.angle);
      const h = raySeg(r, x1, y1, x2, y2);
      if (!h) return null;
      return { t: h.t, nx: -Math.sin(el.angle), ny: Math.cos(el.angle), el };
    }
    case 'lens': {
      const [x1, y1, x2, y2] = segEnds(el.x, el.y, el.height, el.angle);
      const h = raySeg(r, x1, y1, x2, y2);
      if (!h) return null;
      return { t: h.t, nx: -Math.sin(el.angle), ny: Math.cos(el.angle), el, s: h.s };
    }
    case 'wall':
    case 'target': {
      const h = raySeg(r, el.x1, el.y1, el.x2, el.y2);
      if (!h) return null;
      return { t: h.t, nx: 0, ny: 0, el };
    }
    case 'curvedMirror': {
      const c = curvedMirrorCenter(el);
      const R = Math.abs(el.radius);
      const ox = r.x - c.x, oy = r.y - c.y;
      const b = ox * r.dx + oy * r.dy;
      const cc = ox * ox + oy * oy - R * R;
      const disc = b * b - cc;
      if (disc < 0) return null;
      const sq = Math.sqrt(disc);
      // Axis from centre of curvature to vertex.
      const ax = (el.x - c.x) / R, ay = (el.y - c.y) / R;
      const halfAng = Math.asin(Math.min(1, el.aperture / 2 / R));
      for (const t of [-b - sq, -b + sq]) {
        if (t <= EPS) continue;
        const px = r.x + r.dx * t, py = r.y + r.dy * t;
        const nx = (px - c.x) / R, ny = (py - c.y) / R;
        const cosA = nx * ax + ny * ay;
        if (cosA >= Math.cos(halfAng) - 1e-12) return { t, nx, ny, el };
      }
      return null;
    }
    case 'block': {
      let best: Hit | null = null;
      const pts = el.points;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], bb = pts[(i + 1) % pts.length];
        const h = raySeg(r, a.x, a.y, bb.x, bb.y);
        if (h && (!best || h.t < best.t)) {
          const ex = bb.x - a.x, ey = bb.y - a.y;
          const L = Math.hypot(ex, ey);
          best = { t: h.t, nx: ey / L, ny: -ex / L, el, edgeIndex: i };
        }
      }
      return best;
    }
  }
}

/** Is point p inside polygon pts? (ray casting) */
export function insidePolygon(p: Vec, pts: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Trace a ray through the scene. `maxLen` caps the drawn length of an escaping ray. */
export function trace(start: Ray, elements: OpticalElement[], maxBounces = 64, maxLen = 1e3): TraceResult {
  const L = Math.hypot(start.dx, start.dy);
  const r: Ray = { x: start.x, y: start.y, dx: start.dx / L, dy: start.dy / L };
  const points: Vec[] = [{ x: r.x, y: r.y }];
  const touched: string[] = [];
  const tirPoints: Vec[] = [];
  // Which block (if any) the ray is currently inside.
  let medium: Extract<OpticalElement, { kind: 'block' }> | null = null;
  for (const el of elements) if (el.kind === 'block' && insidePolygon(r, el.points)) medium = el;

  for (let bounce = 0; bounce < maxBounces; bounce++) {
    let best: Hit | null = null;
    for (const el of elements) {
      const h = intersect(r, el);
      if (h && (!best || h.t < best.t)) best = h;
    }
    if (!best) {
      points.push({ x: r.x + r.dx * maxLen, y: r.y + r.dy * maxLen });
      return { points, hitTarget: null, touched, tirPoints, escaped: true };
    }
    const px = r.x + r.dx * best.t, py = r.y + r.dy * best.t;
    points.push({ x: px, y: py });
    const el = best.el;
    touched.push(el.id);
    switch (el.kind) {
      case 'target':
        return { points, hitTarget: el.id, touched, tirPoints, escaped: false };
      case 'wall':
        return { points, hitTarget: null, touched, tirPoints, escaped: false };
      case 'mirror':
      case 'curvedMirror': {
        // Lab mirrors are silvered on both faces, so either side reflects.
        const [dx, dy] = reflect(r.dx, r.dy, best.nx, best.ny);
        r.x = px; r.y = py; r.dx = dx; r.dy = dy;
        break;
      }
      case 'lens': {
        // Ideal thin lens. Work in the lens frame: u is along the optical axis, v along the lens.
        const ax = best.nx, ay = best.ny; // axis (lens normal)
        const lx = Math.cos(el.angle), ly = Math.sin(el.angle); // along the lens
        let du = r.dx * ax + r.dy * ay;
        let dv = r.dx * lx + r.dy * ly;
        const sign = du >= 0 ? 1 : -1;
        du *= sign;
        const y = (px - el.x) * lx + (py - el.y) * ly;
        const slope = dv / du - y / el.focal;
        const nd = Math.hypot(1, slope);
        const ndu = (1 / nd) * sign, ndv = slope / nd;
        r.x = px; r.y = py;
        r.dx = ndu * ax + ndv * lx;
        r.dy = ndu * ay + ndv * ly;
        break;
      }
      case 'block': {
        const entering = medium !== el;
        const n1 = entering ? 1 : el.n;
        const n2 = entering ? el.n : 1;
        // Normal pointing toward the incoming side.
        let nx = best.nx, ny = best.ny;
        if (nx * r.dx + ny * r.dy > 0) { nx = -nx; ny = -ny; }
        const out = refract(r.dx, r.dy, nx, ny, n1, n2);
        if (out) {
          medium = entering ? el : null;
          r.dx = out[0]; r.dy = out[1];
        } else {
          tirPoints.push({ x: px, y: py });
          const [dx, dy] = reflect(r.dx, r.dy, nx, ny);
          r.dx = dx; r.dy = dy;
        }
        r.x = px; r.y = py;
        const l = Math.hypot(r.dx, r.dy);
        r.dx /= l; r.dy /= l;
        break;
      }
    }
  }
  return { points, hitTarget: null, touched, tirPoints, escaped: false };
}

/** Thin lens formula (Cartesian sign convention): v = 1/(1/f + 1/u). */
export function lensImage(u: number, f: number): number {
  return 1 / (1 / f + 1 / u);
}

/** Mirror formula 1/v + 1/u = 1/f with f = −R/2 in Cartesian convention (concave: f < 0). */
export function mirrorImage(u: number, f: number): number {
  return 1 / (1 / f - 1 / u);
}

export function criticalAngle(n: number): number {
  return Math.asin(1 / n);
}

/** Minimum deviation of a prism with apex angle A: δ = 2 asin(n sin(A/2)) − A. */
export function prismMinDeviation(n: number, A: number): number {
  return 2 * Math.asin(n * Math.sin(A / 2)) - A;
}

/** Intersection point of two rays given as point+direction (for finding images). */
export function rayCross(p: Vec, d: Vec, q: Vec, e: Vec): Vec | null {
  const den = d.x * e.y - d.y * e.x;
  if (Math.abs(den) < 1e-14) return null;
  const t = ((q.x - p.x) * e.y - (q.y - p.y) * e.x) / den;
  return { x: p.x + d.x * t, y: p.y + d.y * t };
}
