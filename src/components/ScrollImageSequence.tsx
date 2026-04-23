"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface ScrollImageSequenceProps {
  frames: string[];
  startScroll: number;
  endScroll: number;
  className?: string;
}

/**
 * Scroll-scrubbed image sequence rendered to canvas.
 * Optimized for smoothness:
 * - Batched progressive preloading (critical frames first)
 * - Device pixel ratio aware rendering
 * - Object-fit cover drawing
 * - Continuous RAF loop (not scroll-event-driven) for interpolation
 */
export function ScrollImageSequence({
  frames,
  startScroll,
  endScroll,
  className,
}: ScrollImageSequenceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    images: [] as HTMLImageElement[],
    currentFrame: -1,
    targetFrame: 0,
    endScroll,
    running: true,
  });

  useEffect(() => {
    stateRef.current.endScroll = endScroll;
  }, [endScroll]);

  useEffect(() => {
    const state = stateRef.current;
    state.running = true;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    // --- Sizing ---
    function resize() {
      if (!canvas) return;
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = parent.clientWidth * dpr;
      canvas.height = parent.clientHeight * dpr;
      canvas.style.width = `${parent.clientWidth}px`;
      canvas.style.height = `${parent.clientHeight}px`;
      // Force redraw
      state.currentFrame = -1;
    }

    // --- Draw ---
    function draw(index: number) {
      if (!ctx || !canvas) return;
      const img = state.images[index];
      if (!img?.complete || !img.naturalWidth) return;

      const cw = canvas.width;
      const ch = canvas.height;
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const scale = Math.max(cw / iw, ch / ih);
      const sw = iw * scale;
      const sh = ih * scale;

      ctx.drawImage(img, (cw - sw) / 2, (ch - sh) / 2, sw, sh);
    }

    // --- RAF loop (runs every frame, not on scroll events) ---
    function tick() {
      if (!state.running) return;

      // Calculate target frame from scroll position
      const scrollY = window.scrollY;
      const range = state.endScroll - startScroll;
      if (range > 0) {
        const progress = Math.max(
          0,
          Math.min(1, (scrollY - startScroll) / range),
        );
        state.targetFrame = Math.min(
          frames.length - 1,
          Math.max(0, Math.round(progress * (frames.length - 1))),
        );
      }

      // Draw if frame changed
      if (state.targetFrame !== state.currentFrame) {
        state.currentFrame = state.targetFrame;
        draw(state.currentFrame);
      }

      requestAnimationFrame(tick);
    }

    // --- Preload strategy: load nearby frames first ---
    const images: HTMLImageElement[] = new Array(frames.length);
    state.images = images;

    // Phase 1: load first frame immediately
    const first = new Image();
    first.src = frames[0];
    images[0] = first;
    first.onload = () => {
      resize();
      draw(0);
    };

    // Phase 2: load every 10th frame for quick scrub coverage
    const loadKeyFrames = () => {
      for (let i = 0; i < frames.length; i += 10) {
        if (!images[i]) {
          const img = new Image();
          img.src = frames[i];
          images[i] = img;
        }
      }
      // Phase 3: fill in ALL remaining frames
      setTimeout(loadAllRemaining, 100);
    };

    const loadAllRemaining = () => {
      let idx = 0;
      const BATCH = 12;
      const load = () => {
        if (!state.running) return;
        let loaded = 0;
        while (idx < frames.length && loaded < BATCH) {
          if (!images[idx]) {
            const img = new Image();
            img.src = frames[idx];
            images[idx] = img;
            loaded++;
          }
          idx++;
        }
        if (idx < frames.length) {
          setTimeout(load, 8);
        }
      };
      load();
    };

    // Start loading
    setTimeout(loadKeyFrames, 50);

    // Start RAF loop
    requestAnimationFrame(tick);

    window.addEventListener("resize", resize);
    resize();

    return () => {
      state.running = false;
      window.removeEventListener("resize", resize);
    };
     
  }, [frames, startScroll]);

  return (
    <canvas
      ref={canvasRef}
      className={cn("block h-full w-full", className)}
    />
  );
}
