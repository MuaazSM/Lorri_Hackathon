"use client";

import { OdometerDigit } from "@/components/OdometerDigit";
import { howItWorks } from "@/content/copy";

function StepAccordion({
  step,
  defaultOpen,
}: {
  step: (typeof howItWorks.steps)[number];
  defaultOpen: boolean;
}) {
  return (
    <details
      className="group border-t border-white/12 last:border-b last:border-white/12"
      open={defaultOpen || undefined}
    >
      <summary className="flex items-center justify-between py-8 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-6">
          <span className="font-mono text-[2.5rem] font-bold text-[#abff02] w-16">
            <OdometerDigit value={step.number} triggerOnView />
          </span>
          <span className="text-xl md:text-2xl font-semibold text-white">
            {step.title}
          </span>
        </div>
        <svg
          className="w-6 h-6 text-[#7f7f7f] transition-transform duration-300 group-open:rotate-180"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </summary>
      <div className="pb-8 pl-[5.5rem]">
        <p className="text-base text-[#c2c2c2] max-w-[600px] leading-relaxed">
          {step.description}
        </p>
      </div>
    </details>
  );
}

export function HowItWorks() {
  return (
    <section className="py-20 lg:py-32 bg-[#052424]">
      <div className="max-w-7xl mx-auto px-4">
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center mb-6">
          {howItWorks.heading}
        </h2>
        <p className="text-lg text-[#7f7f7f] text-center mb-16 max-w-[600px] mx-auto">
          {howItWorks.subheading}
        </p>

        <div className="max-w-[900px] mx-auto">
          {howItWorks.steps.map((step) => (
            <StepAccordion
              key={step.number}
              step={step}
              defaultOpen={step.number === 1}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
