"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface OdometerDigitProps {
  value: number;
  suffix?: string;
  className?: string;
  triggerOnView?: boolean;
}

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

function DigitColumn({
  digit,
  active,
  staggerDelay,
}: {
  digit: number;
  active: boolean;
  staggerDelay: number;
}) {
  return (
    <div className="overflow-hidden h-[1em] inline-block">
      <div
        className="transition-transform"
        style={{
          transform: active ? `translateY(-${digit}em)` : "translateY(0)",
          transitionDuration: "1.5s",
          transitionTimingFunction: "cubic-bezier(0.19, 1, 0.22, 1)",
          transitionDelay: `${staggerDelay}ms`,
        }}
      >
        {DIGITS.map((d) => (
          <div key={d} className="h-[1em] leading-[1em]">
            {d}
          </div>
        ))}
      </div>
    </div>
  );
}

export function OdometerDigit({
  value,
  suffix,
  className,
  triggerOnView = true,
}: OdometerDigitProps) {
  const [active, setActive] = useState(!triggerOnView);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!triggerOnView) return;

    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [triggerOnView]);

  // Split value into characters (digits and decimal points)
  const valueStr = String(value);
  const chars = valueStr.split("");

  // Count only actual digits (not dots) to compute stagger from the right
  const digitIndices: number[] = [];
  chars.forEach((ch, i) => {
    if (ch !== ".") digitIndices.push(i);
  });
  const totalDigits = digitIndices.length;

  return (
    <div
      ref={containerRef}
      className={cn(
        "inline-flex items-baseline font-mono font-bold text-[#abff02]",
        "text-[min(2.396vw,_61.33px)]",
        className
      )}
      style={{
        fontFamily: "var(--font-mono)",
        fontWeight: 700,
      }}
    >
      {chars.map((ch, i) => {
        if (ch === ".") {
          return (
            <span key={`dot-${i}`} className="h-[1em] leading-[1em]">
              .
            </span>
          );
        }

        const digit = parseInt(ch, 10);
        // Rightmost digit starts first (delay 0), leftmost last
        const digitPosition = digitIndices.indexOf(i);
        const staggerDelay = (totalDigits - 1 - digitPosition) * 100;

        return (
          <DigitColumn
            key={`digit-${i}`}
            digit={digit}
            active={active}
            staggerDelay={staggerDelay}
          />
        );
      })}
      {suffix && (
        <span className="h-[1em] leading-[1em]">{suffix}</span>
      )}
    </div>
  );
}
