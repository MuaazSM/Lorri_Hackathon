/**
 * Central content file. All page copy lives here.
 * Components pull from this file, never hard-coded.
 */
import { brand } from "./brand";

export const nav = {
  logo: brand.name,
  items: [
    { label: "Shipments", href: "/shipments" },
    { label: "Optimize", href: "/optimize" },
    { label: "Scenarios", href: "/scenarios" },
    { label: "Insights", href: "/insights" },
  ],
  cta: { label: "Try Demo", href: "/optimize" },
};

export const hero = {
  headline: [
    "Stop shipping air.",
    "Start shipping smart.",
  ],
  subheadline:
    "Lorri AI automatically consolidates your shipments into fewer, fuller trucks. Upload your freight, hit optimize, and watch costs drop.",
  scrollItems: [
    "80% fewer trucks. 57% lower costs. 57% less carbon.",
    "Your shipments, intelligently grouped into the fewest possible trucks",
    "Every plan stress-tested across 4 real-world scenarios before a single truck moves",
    "AI agents that validate your data, optimize loads, and explain every decision",
  ],
};

export const yosReveal = {
  preText: "Meet",
  brandName: brand.productName,
  description:
    "The load consolidation engine that thinks like your best logistics planner, but runs in under a second and never makes a mistake.",
};

export const benefits = [
  {
    id: "visibility",
    number: "01",
    title: "Smart Consolidation",
    headline: "Turn 20 shipments into 4 fully loaded trucks",
    description:
      "Lorri AI analyzes every shipment in your batch and figures out which ones can share a truck. It considers weight limits, volume constraints, time windows, route compatibility, and handling requirements. The result: dramatically fewer trips with near-perfect utilization.",
    stats: [
      { value: 99.9, suffix: "%", label: "Average truck utilization" },
      { value: 80, suffix: "%", label: "Fewer trucks needed" },
    ],
  },
  {
    id: "automation",
    number: "02",
    title: "Autonomous Decision-Making",
    headline: "An AI that validates, optimizes, and explains itself",
    description:
      "Lorri AI doesn't just crunch numbers. It checks your data for errors before optimizing, prevents dangerous cargo combinations, automatically retries when constraints conflict, and explains every assignment decision in plain language you can share with your team.",
    stats: [
      { value: 57, suffix: "%", label: "Cost reduction" },
      { value: 57, suffix: "%", label: "Carbon reduction" },
    ],
  },
  {
    id: "optimization",
    number: "03",
    title: "What-If Scenarios",
    headline: "Stress-test every plan before committing",
    description:
      "Before a single truck moves, Lorri AI runs your consolidation plan through four different business conditions: tight delivery windows, relaxed SLAs, vehicle shortages, and demand surges. You see exactly how each plan holds up, with cost, carbon, and utilization compared side by side.",
    stats: [
      { value: 4, suffix: "", label: "Scenarios simulated" },
      { value: 1, suffix: "s", label: "Full plan generation" },
    ],
  },
];

export const logoWall = {
  heading: "Powered by three AI paradigms working together",
  subheading:
    "Operations Research for exact optimization. Machine Learning for intelligent pairing. Agentic AI for autonomous reasoning.",
  logos: [
    { name: "OR-Tools", id: "ortools" },
    { name: "LangGraph", id: "langgraph" },
    { name: "scikit-learn", id: "sklearn" },
    { name: "Google Gemini", id: "gemini" },
    { name: "FastAPI", id: "fastapi" },
    { name: "React", id: "react" },
    { name: "Recharts", id: "recharts" },
    { name: "Leaflet", id: "leaflet" },
  ],
};

export const testimonial = {
  quote:
    "We went from manually planning loads in spreadsheets to getting a fully optimized consolidation plan in under a second. The scenario simulation alone saved us from two bad shipping decisions in the first week.",
  author: {
    name: "The Jugaadus",
    title: "Problem Statement 5",
    company: "Logistics Lorri Hackathon",
  },
};

export const trustedBy = {
  heading: "Validated against industry benchmarks",
  logos: [
    { name: "Solomon C101", id: "solomon-c101" },
    { name: "Solomon R101", id: "solomon-r101" },
    { name: "VRPTW", id: "vrptw" },
    { name: "Indian Freight", id: "indian-freight" },
    { name: "Synthetic 200+", id: "synthetic" },
    { name: "9 City Hubs", id: "city-hubs" },
  ],
};

export const howItWorks = {
  heading: "How it works",
  subheading: "From raw shipments to optimized plan in four steps",
  steps: [
    {
      number: 1,
      title: "Upload your shipments",
      description:
        "Drop in your shipment batch via CSV or API. Lorri AI validates everything automatically: weight limits, time windows, missing fields. Bad data gets flagged before it can cause problems downstream.",
    },
    {
      number: 2,
      title: "AI finds the best pairings",
      description:
        "The system scores every possible shipment combination for compatibility. Which ones share a route? Which fit together by weight and volume? Which have overlapping pickup windows? Only the best matches move forward.",
    },
    {
      number: 3,
      title: "Optimizer assigns trucks",
      description:
        "A mathematical solver assigns shipments to the fewest trucks possible while respecting every constraint. If something doesn't fit, the system automatically diagnoses the conflict and retries with adjusted parameters.",
    },
    {
      number: 4,
      title: "Review, simulate, ship",
      description:
        "Your consolidation plan is ready with full cost and carbon breakdowns. Run what-if scenarios to stress-test the plan. When you're confident, export the assignments and dispatch.",
    },
  ],
};

export const contactForm = {
  heading: "See it in action",
  subheading:
    "Upload a shipment batch and watch Lorri AI consolidate it in real time. No setup required.",
  fields: [
    { name: "firstName", label: "First name", type: "text" as const, required: true },
    { name: "lastName", label: "Last name", type: "text" as const, required: true },
    { name: "email", label: "Work email", type: "email" as const, required: true },
    { name: "company", label: "Company", type: "text" as const, required: true },
    { name: "phone", label: "Phone number", type: "tel" as const, required: false },
    {
      name: "message",
      label: "Tell us about your freight volume",
      type: "textarea" as const,
      required: false,
    },
  ],
  submitLabel: "Request Demo",
};

export const footer = {
  brand: brand.name,
  tagline: brand.tagline,
  columns: [
    {
      title: "Product",
      links: [
        { label: "Shipments", href: "/shipments" },
        { label: "Optimizer", href: "/optimize" },
        { label: "Scenarios", href: "/scenarios" },
        { label: "AI Insights", href: "/insights" },
      ],
    },
    {
      title: "Technology",
      links: [
        { label: "OR-Tools Solver", href: "#" },
        { label: "LangGraph Agents", href: "#" },
        { label: "ML Compatibility", href: "#" },
        { label: "Gemini Narratives", href: "#" },
      ],
    },
    {
      title: "Resources",
      links: [
        { label: "Documentation", href: "#" },
        { label: "API Reference", href: "#" },
        { label: "GitHub", href: "#" },
        { label: "Presentation", href: "#" },
      ],
    },
    {
      title: "Team",
      links: [
        { label: "Muaaz", href: "#" },
        { label: "Manikya", href: "#" },
        { label: "Aditya", href: "#" },
        { label: "Vaishnavi", href: "#" },
      ],
    },
  ],
  copyright: brand.copyright,
};
