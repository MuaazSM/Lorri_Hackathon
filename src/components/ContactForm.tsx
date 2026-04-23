"use client";

import { useState } from "react";
import { contactForm } from "@/content/copy";

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  phone: string;
  message: string;
}

interface FormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  company?: string;
}

const steps = [
  {
    number: "01",
    title: "Upload your shipment data",
    description:
      "Bulk upload via API or CSV. Lorri AI validates and ingests thousands of shipments across Indian freight corridors.",
  },
  {
    number: "02",
    title: "Run the agentic pipeline",
    description:
      "One API call triggers the full optimization pipeline. Consolidation plan with scenarios in under 1 second.",
  },
  {
    number: "03",
    title: "Deploy and learn",
    description:
      "Lorri AI logs every optimization run and retrains its ML model every 10 runs. The system gets smarter with every use.",
  },
];

const inputClasses =
  "w-full bg-transparent border border-white/12 rounded-lg px-4 py-3.5 text-white placeholder:text-white/40 focus:border-[#abff02] focus:outline-none focus:ring-1 focus:ring-[#abff02]/20 transition-colors";

const errorClasses = "border-[#f87171]";

export function ContactForm() {
  const [formData, setFormData] = useState<FormData>({
    firstName: "",
    lastName: "",
    email: "",
    company: "",
    phone: "",
    message: "",
  });

  const [errors, setErrors] = useState<FormErrors>({});

  function validate(): boolean {
    const next: FormErrors = {};

    if (!formData.firstName.trim()) next.firstName = "Required";
    if (!formData.lastName.trim()) next.lastName = "Required";
    if (!formData.email.trim()) {
      next.email = "Required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      next.email = "Invalid email";
    }
    if (!formData.company.trim()) next.company = "Required";

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy[name as keyof FormErrors];
        return copy;
      });
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    // TODO: POST to your backend
    console.log("Form submitted:", formData);
  }

  return (
    <section className="py-20 lg:py-28 bg-[#052424]" id="contact">
      <div className="mx-auto max-w-[1280px] px-6 lg:px-10">
        {/* Section heading */}
        <div className="mb-16">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight text-white mb-4">
            {contactForm.heading}
          </h2>
          <p className="text-base lg:text-lg text-[#7f7f7f] max-w-[640px]">
            {contactForm.subheading}
          </p>
        </div>

        {/* Two-column: numbered info list + form */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24">
          {/* Left: numbered info points */}
          <div className="space-y-8">
            {steps.map((step) => (
              <div key={step.number} className="flex gap-6">
                <span className="font-mono text-2xl font-bold text-[#abff02] shrink-0 w-10">
                  {step.number}
                </span>
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">
                    {step.title}
                  </h3>
                  <p className="text-sm text-[#7f7f7f]">{step.description}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Right: the form */}
          <form onSubmit={handleSubmit} noValidate>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* First name + Last name */}
              <input
                type="text"
                name="firstName"
                placeholder={
                  contactForm.fields.find((f) => f.name === "firstName")
                    ?.label ?? "First name"
                }
                value={formData.firstName}
                onChange={handleChange}
                className={`${inputClasses} ${errors.firstName ? errorClasses : ""}`}
              />
              <input
                type="text"
                name="lastName"
                placeholder={
                  contactForm.fields.find((f) => f.name === "lastName")
                    ?.label ?? "Last name"
                }
                value={formData.lastName}
                onChange={handleChange}
                className={`${inputClasses} ${errors.lastName ? errorClasses : ""}`}
              />

              {/* Email + Company */}
              <input
                type="email"
                name="email"
                placeholder={
                  contactForm.fields.find((f) => f.name === "email")?.label ??
                  "Work email"
                }
                value={formData.email}
                onChange={handleChange}
                className={`${inputClasses} ${errors.email ? errorClasses : ""}`}
              />
              <input
                type="text"
                name="company"
                placeholder={
                  contactForm.fields.find((f) => f.name === "company")
                    ?.label ?? "Company"
                }
                value={formData.company}
                onChange={handleChange}
                className={`${inputClasses} ${errors.company ? errorClasses : ""}`}
              />
            </div>

            {/* Phone — full width */}
            <input
              type="tel"
              name="phone"
              placeholder={
                contactForm.fields.find((f) => f.name === "phone")?.label ??
                "Phone number"
              }
              value={formData.phone}
              onChange={handleChange}
              className={`${inputClasses} mt-4`}
            />

            {/* Message — full width */}
            <textarea
              name="message"
              placeholder={
                contactForm.fields.find((f) => f.name === "message")?.label ??
                "How can we help?"
              }
              value={formData.message}
              onChange={handleChange}
              className={`${inputClasses} mt-4 min-h-[140px] resize-none`}
            />

            {/* Submit */}
            <button
              type="submit"
              className="w-full bg-[#abff02] text-[#052424] font-semibold text-sm uppercase tracking-wider py-4 rounded-lg mt-6 hover:opacity-90 transition-opacity"
            >
              {contactForm.submitLabel}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
