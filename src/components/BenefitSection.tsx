"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { benefits } from "@/content/copy";
import type { BenefitSection as BenefitSectionType } from "@/types";

const benefitVideos: Record<string, string> = {
  visibility: "/videos/benefit-01.mp4",
  automation: "/videos/benefit-02.mp4",
  optimization: "/videos/benefit-03.mp4",
};

function BenefitSection({ benefit }: { benefit: BenefitSectionType }) {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Play/pause video based on viewport visibility
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.3 },
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  // Fade-in on scroll
  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(node);
    return () => observer.unobserve(node);
  }, []);

  const videoSrc = benefitVideos[benefit.id];

  return (
    <section ref={sectionRef} className="relative min-h-[200vh]">
      <div className="notch-separator" />

      <div className="site-container">
        <div className="flex flex-col lg:flex-row lg:gap-16">
          {/* Left: sticky text */}
          <div
            className={cn(
              "w-full lg:w-5/12 lg:sticky lg:top-[30vh] lg:self-start py-20 lg:py-0 lg:pt-20",
              "transition-all duration-700 ease-out",
              isVisible
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-6",
            )}
          >
            <span className="label-mono block mb-3 text-lime">
              {benefit.number}
            </span>
            <span className="label-mono block mb-8 text-site-dark-gray">
              {benefit.title}
            </span>
            <h2 className="title-h2 mb-6 text-white">{benefit.headline}</h2>
            <p className="body-2 mb-10 text-site-light-gray">
              {benefit.description}
            </p>

            <div className="flex gap-16">
              {benefit.stats.map((stat) => (
                <div key={stat.label}>
                  <p className="title-h3 text-lime">
                    {stat.value}
                    <span>{stat.suffix}</span>
                  </p>
                  <p className="label-mono mt-1 text-site-dark-gray">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Right: autoplay video */}
          <div
            className={cn(
              "w-full lg:w-7/12 flex items-start justify-center py-20",
              "transition-all duration-700 ease-out delay-200",
              isVisible
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-6",
            )}
          >
            <div className="w-full aspect-[9/16] max-h-[75vh] rounded-2xl overflow-hidden border border-white/10 bg-black">
              {videoSrc ? (
                <video
                  ref={videoRef}
                  src={videoSrc}
                  muted
                  loop
                  playsInline
                  preload="auto"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <span className="label-mono text-white/20">
                    Media placeholder
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function BenefitSections() {
  return (
    <div>
      {benefits.map((benefit) => (
        <BenefitSection key={benefit.id} benefit={benefit} />
      ))}
    </div>
  );
}

export { BenefitSection, BenefitSections };
