"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { yosReveal } from "@/content/copy";

export function YOSReveal() {
  const sectionRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative min-h-[200vh] bg-[#000]"
    >
      <div className="sticky top-0 h-screen flex flex-col items-center justify-center">
        {/* Pre-text */}
        <p
          className={cn(
            "label-mono text-site-light-gray mb-6",
            "transition-all duration-700 ease-out",
            isVisible
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-6"
          )}
        >
          {yosReveal.preText}
        </p>

        {/* Brand name */}
        <h2
          className={cn(
            "title-h1 text-center",
            "transition-[opacity,transform] duration-700 ease-out delay-200",
            isVisible
              ? "opacity-100 scale-100"
              : "opacity-0 scale-[0.85]"
          )}
          style={{
            color: isVisible ? "#abff02" : "#c2c2c2",
            transition:
              "color 1.2s ease-out 0.2s, opacity 0.7s ease-out 0.2s, transform 0.7s ease-out 0.2s",
          }}
        >
          {yosReveal.brandName}
        </h2>

        {/* Description */}
        <p
          className={cn(
            "body-1 text-site-dark-gray max-w-[640px] text-center mt-8 px-6",
            "transition-all duration-700 ease-out delay-500",
            isVisible
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-6"
          )}
        >
          {yosReveal.description}
        </p>
      </div>
    </section>
  );
}
