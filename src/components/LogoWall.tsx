"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface LogoItem {
  name: string;
  id: string;
}

interface LogoWallProps {
  heading: string;
  subheading?: string;
  logos: LogoItem[];
  variant?: "dark" | "light";
}

export function LogoWall({
  heading,
  subheading,
  logos,
  variant = "dark",
}: LogoWallProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.15 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const isDark = variant === "dark";

  return (
    <section
      ref={sectionRef}
      className={cn(
        "section-padding",
        isDark ? "bg-[#052424] text-white" : "bg-white text-[#052424]"
      )}
    >
      <div className="site-container">
        <div className="text-center">
          <h3
            className={cn(
              "title-h3",
              isDark ? "text-white" : "text-[#052424]"
            )}
          >
            {heading}
          </h3>
          {subheading && (
            <p
              className={cn(
                "mt-4 text-base md:text-lg",
                isDark ? "text-white/60" : "text-[#052424]/60"
              )}
            >
              {subheading}
            </p>
          )}
        </div>

        <div className="mt-12 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6 md:gap-8">
          {logos.map((logo, index) => (
            <div
              key={logo.id}
              className={cn(
                "flex h-20 md:h-24 items-center justify-center rounded-xl border transition-colors duration-300",
                isDark
                  ? "border-white/8 hover:border-white/20"
                  : "border-gray-200/50 hover:border-gray-300",
                "opacity-0 translate-y-4 transition-all duration-500 ease-out",
                isVisible && "opacity-100 translate-y-0"
              )}
              style={{
                transitionDelay: isVisible ? `${index * 80}ms` : "0ms",
              }}
            >
              <span
                className={cn(
                  "label-mono",
                  isDark ? "text-white/50" : "text-[#052424]/50"
                )}
              >
                {logo.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
