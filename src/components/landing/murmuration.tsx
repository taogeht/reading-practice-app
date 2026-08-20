"use client";

// The landing page's one piece of atmosphere: a starling murmuration.
//
// Starlings are vocal mimics — they learn songs by listening and repeating,
// which is the whole premise of the app — and they fly in murmurations, a
// flock moving as one body. So the flock is the brand mark in motion rather
// than a generic particle field: each speck is a bird, the drift is real
// boid behaviour (cohesion, alignment, separation), not random noise.
//
// It is deliberately quiet. The page's job is to get three different people
// to three different doors; the flock sits behind that and never competes.
//
// Skipped entirely when the visitor prefers reduced motion, and on narrow
// viewports — a good share of the students open this on cheap school tablets
// and a canvas loop is not worth their battery.

import { useEffect, useRef } from "react";

interface Bird {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gold: boolean;
}

// A real murmuration reads as a shape, not a scatter — that needs enough
// birds for the mass to have a silhouette and a varying density. 220 keeps
// the O(n²) neighbour pass around 48k distance checks a frame, which is
// comfortable on a laptop; narrow screens skip the whole effect anyway.
const BIRD_COUNT = 220;
const MAX_SPEED = 0.85;
const NEIGHBOUR_RADIUS = 62;
const SEPARATION_RADIUS = 13;

// A flock needs somewhere to be going, or the boids spread into an even dust
// and stop reading as one body. A slow attractor drifting through the right
// half of the hero — the side the type leaves empty — keeps the murmuration
// massed and moving without it ever crossing the headline.
const ATTRACTOR_PERIOD_MS = 21_000;

export function Murmuration() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const narrow = window.matchMedia("(max-width: 640px)");
    if (reducedMotion.matches || narrow.matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let frame = 0;
    let running = true;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    // Born already massed on the right, so the first frame is a flock rather
    // than a scatter that slowly gathers. A few catch the light — the gold of
    // the mark against the blue.
    const birds: Bird[] = Array.from({ length: BIRD_COUNT }, (_, i) => ({
      x: width * 0.68 + (Math.random() - 0.5) * width * 0.24,
      y: height * 0.45 + (Math.random() - 0.5) * height * 0.42,
      vx: (Math.random() - 0.5) * MAX_SPEED,
      vy: (Math.random() - 0.5) * MAX_SPEED,
      gold: i % 6 === 0,
    }));

    const start = performance.now();

    const step = () => {
      if (!running) return;
      ctx.clearRect(0, 0, width, height);

      // Lissajous drift: two incommensurate periods, so the flock never
      // retraces the same path and never settles into an obvious loop.
      const t = ((performance.now() - start) % ATTRACTOR_PERIOD_MS) / ATTRACTOR_PERIOD_MS;
      const ax0 = width * (0.66 + 0.17 * Math.sin(t * Math.PI * 2));
      const ay0 = height * (0.46 + 0.3 * Math.sin(t * Math.PI * 2 * 1.618));

      for (const bird of birds) {
        let cx = 0, cy = 0, ax = 0, ay = 0, sx = 0, sy = 0, n = 0;

        for (const other of birds) {
          if (other === bird) continue;
          const dx = other.x - bird.x;
          const dy = other.y - bird.y;
          const dist = Math.hypot(dx, dy);
          if (dist > NEIGHBOUR_RADIUS) continue;
          cx += other.x;
          cy += other.y;
          ax += other.vx;
          ay += other.vy;
          if (dist < SEPARATION_RADIUS && dist > 0) {
            sx -= dx / dist;
            sy -= dy / dist;
          }
          n++;
        }

        if (n > 0) {
          bird.vx += ((cx / n - bird.x) * 0.0022) + ((ax / n - bird.vx) * 0.055) + sx * 0.05;
          bird.vy += ((cy / n - bird.y) * 0.0022) + ((ay / n - bird.vy) * 0.055) + sy * 0.05;
        }

        // Pull toward the drifting attractor keeps the flock a single body.
        bird.vx += (ax0 - bird.x) * 0.0013;
        bird.vy += (ay0 - bird.y) * 0.0013;

        const speed = Math.hypot(bird.vx, bird.vy);
        if (speed > MAX_SPEED) {
          bird.vx = (bird.vx / speed) * MAX_SPEED;
          bird.vy = (bird.vy / speed) * MAX_SPEED;
        }

        bird.x += bird.vx;
        bird.y += bird.vy;

        // Wrap rather than bounce: a flock has no walls.
        if (bird.x < -10) bird.x = width + 10;
        if (bird.x > width + 10) bird.x = -10;
        if (bird.y < -10) bird.y = height + 10;
        if (bird.y > height + 10) bird.y = -10;

        // Each bird is a short stroke along its heading, not a dot — at this
        // size that reads as a wing rather than dust.
        ctx.strokeStyle = bird.gold ? "rgba(242,183,5,0.9)" : "rgba(141,186,232,0.62)";
        ctx.lineWidth = bird.gold ? 2 : 1.5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(bird.x, bird.y);
        ctx.lineTo(bird.x - bird.vx * 7, bird.y - bird.vy * 7);
        ctx.stroke();
      }

      frame = requestAnimationFrame(step);
    };
    step();

    // Stop burning frames on a tab nobody is looking at.
    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(frame);
      } else if (!running) {
        running = true;
        step();
      }
    };

    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      running = false;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
