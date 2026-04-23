export interface NavItem {
  label: string;
  href: string;
}

export interface BenefitStat {
  value: number;
  suffix: string;
  label: string;
}

export interface BenefitSection {
  id: string;
  number: string;
  title: string;
  headline: string;
  description: string;
  stats: BenefitStat[];
}

export interface LogoItem {
  name: string;
  id: string;
}

export interface TestimonialData {
  quote: string;
  author: {
    name: string;
    title: string;
    company: string;
  };
}

export interface HowItWorksStep {
  number: number;
  title: string;
  description: string;
}

export interface FormField {
  name: string;
  label: string;
  type: "text" | "email" | "tel" | "textarea";
  required: boolean;
}

export interface FooterColumn {
  title: string;
  links: { label: string; href: string }[];
}
