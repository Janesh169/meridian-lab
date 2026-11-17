/**
 * Hosts a puzzle on a canvas:
 *  - devicePixelRatio is capped at 2, and the canvas follows its box via ResizeObserver
 *  - the rAF loop runs simulations at full rate and idle scenes at about 30 fps
 *  - one finger drags or rotates puzzle objects, or pans when zoomed in
 *  - two fingers pinch to zoom, or twist the selected object
 *  - double-tap resets the zoom
 */
import { useEffect, useRef } from 'preact/hooks';
import { Camera, Draw } from '../render/draw';
import type { Puzzle } from '../puzzles/framework';

export function PuzzleCanvas(props: { puzzle: Puzzle; onFrame?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pz = useRef(props.puzzle);
  pz.current = props.puzzle;

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    const cam = new Camera(pz.current.view());
    let cssW = 1, cssH = 1, dpr = 1;
    // Leave room for the brief text along the top.
    const fitCam = () => cam.fit(cssW, cssH, 14, 46, 14);
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      cssW = Math.max(1, r.width);
      cssH = Math.max(1, r.height);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      fitCam();
    };
    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(canvas);
    window.addEventListener('resize', resize);

    // ---- gestures
    const pointers = new Map<number, { x: number; y: number }>();
    let mode: 'none' | 'object' | 'pan' | 'pinch' = 'none';
    let pinchStart = { d: 0, a: 0, zoom: 1, cx: 0, cy: 0, panX: 0, panY: 0 };
    let panStart = { x: 0, y: 0, panX: 0, panY: 0 };
    let lastTap = 0;
    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const two = () => {
      const [a, b] = [...pointers.values()];
      return { d: Math.hypot(b.x - a.x, b.y - a.y), a: Math.atan2(b.y - a.y, b.x - a.x), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    };
    const down = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const p = local(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 1) {
        const now = performance.now();
        if (now - lastTap < 300) { cam.zoom = 1; cam.panX = 0; cam.panY = 0; fitCam(); }
        lastTap = now;
        const w = cam.toWorld(p.x, p.y);
        if (pz.current.pointerDown(w, cam.scale)) mode = 'object';
        else { mode = 'pan'; panStart = { x: p.x, y: p.y, panX: cam.panX, panY: cam.panY }; }
      } else if (pointers.size === 2) {
        if (mode === 'object') pz.current.pointerUp();
        mode = 'pinch';
        const t = two();
        pinchStart = { ...t, zoom: cam.zoom, panX: cam.panX, panY: cam.panY };
      }
    };
    const move = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      const p = local(e);
      pointers.set(e.pointerId, p);
      if (mode === 'object') pz.current.pointerMove(cam.toWorld(p.x, p.y));
      else if (mode === 'pan' && cam.zoom > 1.01) {
        cam.panX = panStart.panX - (p.x - panStart.x) / cam.scale;
        cam.panY = panStart.panY + (p.y - panStart.y) / cam.scale;
        fitCam();
      } else if (mode === 'pinch' && pointers.size >= 2) {
        const t = two();
        const twist = t.a - pinchStart.a;
        // A clear twist rotates the selected object; otherwise it's a pinch-zoom.
        if (Math.abs(twist) > 0.03 && pz.current.twist(-twist)) {
          pinchStart.a = t.a;
        } else {
          cam.zoom = Math.min(4, Math.max(1, (pinchStart.zoom * t.d) / Math.max(1, pinchStart.d)));
          fitCam();
        }
      }
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (mode === 'object' && pointers.size === 0) pz.current.pointerUp();
      if (pointers.size === 0) mode = 'none';
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);

    // ---- loop
    let raf = 0;
    let last = performance.now();
    let lastDraw = 0;
    const d = new Draw(ctx, cam, cssW, cssH);
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const p = pz.current;
      if (cam.view !== p.view()) { cam.view = p.view(); fitCam(); }
      const running = p.status === 'running';
      if (running) p.update(dt);
      if (!running && t - lastDraw < 32) return;
      lastDraw = t;
      d.w = cssW; d.h = cssH;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      p.draw(d, t / 1000);
      props.onFrame?.();
    };
    raf = requestAnimationFrame(frame);
    const vis = () => { last = performance.now(); };
    document.addEventListener('visibilitychange', vis);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);

  return <canvas ref={ref} aria-label="Experiment" />;
}
