"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { nav } from "@/content/copy";

const NAV_ITEMS = nav.items;
const CTA = nav.cta;

const SCROLL_THRESHOLD = 50;

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Scroll listener
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > SCROLL_THRESHOLD);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Body scroll lock when drawer is open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  // Close drawer on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && drawerOpen) {
        setDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [drawerOpen]);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  return (
    <>
      {/* Fixed header wrapper */}
      <header
        className="fixed left-0 right-0 z-50"
        style={{ top: "1.5625rem" }}
      >
        {/* Pill-shaped floating nav */}
        <nav
          className={cn(
            "mx-auto transition-all duration-300",
            "px-[5.128vw] lg:px-[min(3.646vw,93.33px)]",
            scrolled
              ? "rounded-2xl border border-white/12 bg-black/40 backdrop-blur-[30px]"
              : "bg-transparent"
          )}
          style={{
            transitionTimingFunction: "var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1))",
          }}
        >
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <Link
              href="/"
              className="text-lg font-semibold text-white"
            >
              Lorri AI
            </Link>

            {/* Desktop nav links */}
            <ul className="hidden items-center gap-8 lg:flex">
              {NAV_ITEMS.map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className="link-underline relative text-sm text-white/70 transition-colors duration-200 hover:text-white"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>

            {/* Desktop CTA + Mobile hamburger */}
            <div className="flex items-center gap-4">
              <Link
                href={CTA.href}
                className="hidden rounded-full bg-[#abff02] px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#052424] transition-opacity duration-200 hover:opacity-90 lg:inline-block"
              >
                {CTA.label}
              </Link>

              {/* Hamburger button (mobile) */}
              <button
                type="button"
                onClick={() => setDrawerOpen(!drawerOpen)}
                className="relative flex h-10 w-10 flex-col items-center justify-center gap-1.5 lg:hidden"
                aria-label={drawerOpen ? "Close menu" : "Open menu"}
                aria-expanded={drawerOpen}
              >
                <span
                  className={cn(
                    "h-0.5 w-5 rounded-full bg-white transition-all duration-300",
                    drawerOpen && "translate-y-[4px] rotate-45"
                  )}
                />
                <span
                  className={cn(
                    "h-0.5 w-5 rounded-full bg-white transition-all duration-300",
                    drawerOpen && "-translate-y-[4px] -rotate-45"
                  )}
                />
              </button>
            </div>
          </div>
        </nav>
      </header>

      {/* Mobile drawer overlay */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 lg:hidden",
          drawerOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        )}
        onClick={closeDrawer}
        aria-hidden="true"
      />

      {/* Mobile drawer panel */}
      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-80 flex-col border-l border-white/12 bg-black/80 backdrop-blur-[30px] lg:hidden",
          "transition-transform"
        )}
        style={{
          transform: drawerOpen ? "translateX(0)" : "translateX(100%)",
          transitionDuration: "1s",
          transitionTimingFunction: "cubic-bezier(0.19, 1, 0.22, 1)",
        }}
      >
        {/* Drawer header with logo */}
        <div className="flex h-16 items-center px-6" style={{ marginTop: "1.5625rem" }}>
          <Link
            href="/"
            className="text-lg font-semibold text-white"
            onClick={closeDrawer}
          >
            Lorri AI
          </Link>
        </div>

        {/* Drawer nav links */}
        <nav className="flex-1 overflow-y-auto px-6 py-6">
          <ul className="flex flex-col gap-4">
            {NAV_ITEMS.map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  onClick={closeDrawer}
                  className="block py-2 text-base text-white/70 transition-colors duration-200 hover:text-white"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Drawer CTA */}
        <div className="px-6 pb-8">
          <Link
            href={CTA.href}
            onClick={closeDrawer}
            className="block w-full rounded-full bg-[#abff02] px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[#052424] transition-opacity duration-200 hover:opacity-90"
          >
            {CTA.label}
          </Link>
        </div>
      </aside>
    </>
  );
}
