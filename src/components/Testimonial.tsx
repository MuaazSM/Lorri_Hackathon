"use client";

import { useEffect, useRef, useState } from "react";

interface TestimonialAuthor {
  name: string;
  title: string;
  company: string;
}

interface TestimonialProps {
  quote: string;
  author: TestimonialAuthor;
}

export function Testimonial({ quote, author }: TestimonialProps) {
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

  return (
    <section ref={sectionRef} className="section-padding bg-white">
      <div className="site-container">
        <div
          className={[
            "max-w-[1283px] mx-auto flex flex-row",
            "border-l-4 border-[#abff02] pl-8 md:pl-12",
            "opacity-0 translate-y-6 transition-all duration-700 ease-out",
            isVisible ? "opacity-100 translate-y-0" : "",
          ].join(" ")}
        >
          <div>
            <blockquote
              className="text-[#052424] leading-[1.2] font-[400]"
              style={{
                fontSize: "clamp(1.25rem, 5.128vw, 2.5rem)",
                letterSpacing: "-0.32px",
              }}
            >
              &ldquo;{quote}&rdquo;
            </blockquote>

            <div className="mt-10">
              <p className="body-2 font-semibold text-[#052424]">
                {author.name}
              </p>
              <p className="body-3 text-[#052424]/60 mt-1">
                {author.title}, {author.company}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
