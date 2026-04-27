import { SmoothScroll } from "@/components/SmoothScroll";
import { Nav } from "@/components/Nav";
import { HeroSection } from "@/components/HeroSection";
import { YOSReveal } from "@/components/YOSReveal";
import { BenefitSections } from "@/components/BenefitSection";
import { LogoWall } from "@/components/LogoWall";
import { Testimonial } from "@/components/Testimonial";
import { HowItWorks } from "@/components/HowItWorks";
import { Footer } from "@/components/Footer";
import { logoWall, trustedBy, testimonial } from "@/content/copy";

export default function Home() {
  return (
    <>
      <SmoothScroll />
      <Nav />
      <main>
        {/* Hero with scroll-scrubbed image sequence */}
        <HeroSection />

        {/* Product reveal transition */}
        <YOSReveal />

        {/* 3 benefit sections with sticky text + media */}
        <BenefitSections />

        {/* Customer logo wall */}
        <LogoWall
          heading={logoWall.heading}
          subheading={logoWall.subheading}
          logos={logoWall.logos}
          variant="dark"
        />

        {/* Testimonial quote */}
        <Testimonial quote={testimonial.quote} author={testimonial.author} />

        {/* Trusted-by partner logos */}
        <LogoWall
          heading={trustedBy.heading}
          logos={trustedBy.logos}
          variant="light"
        />

        {/* How it works with odometer counters */}
        <HowItWorks />

      </main>

      <Footer />
    </>
  );
}
