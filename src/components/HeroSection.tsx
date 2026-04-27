"use client";

import { useEffect, useRef, useState } from "react";
import { ScrollImageSequence } from "@/components/ScrollImageSequence";
import { hero } from "@/content/copy";

const frames = Array.from(
  { length: 410 },
  (_, i) => `/frames/${String(i).padStart(4, "0")}.webp`,
);

/**
 * Terminal Industries–style hero: frame sequence plays in background while
 * multiple text titles fade in/out sequentially as you scroll.
 * Uses a continuous RAF loop for butter-smooth animations.
 */
export function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const titleRefs = useRef<(HTMLHeadingElement | null)[]>([]);
  const headlineRef = useRef<HTMLDivElement>(null);
  const subheadRef = useRef<HTMLParagraphElement>(null);

  const items = hero.scrollItems;
  const totalItems = items.length;

  useEffect(() => {
    let running = true;

    // Smooth lerped progress for extra fluidity
    let currentProgress = 0;

    function tick() {
      if (!running) return;

      const section = sectionRef.current;
      if (section) {
        const rect = section.getBoundingClientRect();
        const sectionTop = -rect.top;
        const height = section.offsetHeight - window.innerHeight;
        const rawProgress = Math.max(0, Math.min(1, sectionTop / height));

        // Lerp for smoothness (0.15 = smooth follow)
        currentProgress += (rawProgress - currentProgress) * 0.15;

        updateAnimations(currentProgress);
      }

      requestAnimationFrame(tick);
    }

    function updateAnimations(progress: number) {
      // === Phase 1: Initial headline (0% – 18%) ===
      const headline = headlineRef.current;
      if (headline) {
        let opacity = 0;
        let y = 0;
        if (progress < 0.05) {
          opacity = progress / 0.05;
        } else if (progress < 0.10) {
          opacity = 1;
        } else if (progress < 0.18) {
          const t = (progress - 0.10) / 0.08;
          opacity = 1 - t;
          y = -t * 60;
        }
        headline.style.opacity = String(opacity);
        headline.style.transform = `translateY(${y}px)`;
      }

      const subhead = subheadRef.current;
      if (subhead) {
        let opacity = 0;
        let y = 0;
        if (progress > 0.03 && progress < 0.05) {
          opacity = (progress - 0.03) / 0.02;
        } else if (progress >= 0.05 && progress < 0.10) {
          opacity = 1;
        } else if (progress >= 0.10 && progress < 0.18) {
          const t = (progress - 0.10) / 0.08;
          opacity = 1 - t;
          y = -t * 60;
        }
        subhead.style.opacity = String(opacity);
        subhead.style.transform = `translateY(${y}px)`;
      }

      // === Phase 2: Scroll items (18% – 88%) ===
      const scrollStart = 0.18;
      const scrollEnd = 0.88;
      const range = scrollEnd - scrollStart;
      const itemLen = range / totalItems;

      titleRefs.current.forEach((el, i) => {
        if (!el) return;
        const start = scrollStart + i * itemLen;
        const fadeIn = start;
        const holdStart = start + itemLen * 0.2;
        const holdEnd = start + itemLen * 0.65;
        const fadeOut = start + itemLen;

        let opacity = 0;
        let y = 40;

        if (progress >= fadeIn && progress < holdStart) {
          const t = (progress - fadeIn) / (holdStart - fadeIn);
          opacity = t;
          y = 40 * (1 - t);
        } else if (progress >= holdStart && progress < holdEnd) {
          opacity = 1;
          y = 0;
        } else if (progress >= holdEnd && progress < fadeOut) {
          const t = (progress - holdEnd) / (fadeOut - holdEnd);
          opacity = 1 - t;
          y = -50 * t;
        }

        el.style.opacity = String(opacity);
        el.style.transform = `translateY(${y}px)`;
      });
    }

    requestAnimationFrame(tick);

    return () => {
      running = false;
    };
  }, [totalItems]);

  const [endScroll, setEndScroll] = useState(5000);

  useEffect(() => {
    function update() {
      if (sectionRef.current) {
        setEndScroll(sectionRef.current.offsetHeight - window.innerHeight);
      }
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative"
      style={{ height: "500svh" }}
    >
      {/* Sticky viewport container */}
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        {/* Frame sequence background */}
        <div className="absolute inset-0">
          <ScrollImageSequence
            frames={frames}
            startScroll={0}
            endScroll={endScroll}
          />
        </div>

        {/* Bottom fade to match page background */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#0a0a0a] to-transparent" />

        {/* === Initial headline (bottom-aligned) === */}
        <div
          ref={headlineRef}
          className="absolute inset-0 z-10 flex flex-col justify-end"
          style={{ opacity: 0 }}
        >
          <div className="site-container pb-[3.75rem] lg:pb-[8.4375rem]">
            <h1 className="title-h1 text-white">
              {hero.headline.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </h1>
            <p
              ref={subheadRef}
              className="body-1 mt-6 max-w-[640px] text-white/60"
              style={{ opacity: 0 }}
            >
              {hero.subheadline}
            </p>
          </div>
        </div>

        {/* === Scroll-driven text items (centered) === */}
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          {items.map((item, i) => (
            <h2
              key={i}
              ref={(el) => {
                titleRefs.current[i] = el;
              }}
              className="title-h2 absolute max-w-[900px] px-6 text-center text-white"
              style={{
                opacity: 0,
                transform: "translateY(40px)",
                willChange: "opacity, transform",
              }}
            >
              {item}
            </h2>
          ))}
        </div>
      </div>
    </section>
  );
}
