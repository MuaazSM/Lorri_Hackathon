"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Toaster } from "react-hot-toast";
import { AppProvider } from "@/context/AppContext";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import "@/app/app-unified.css";

const PAGE_THEMES: Record<string, string> = {
  "/shipments": "shipments",
  "/optimize": "optimize",
  "/scenarios": "scenarios",
  "/insights": "insights",
};

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const pageTheme = PAGE_THEMES[pathname] ?? "home";

  useEffect(() => {
    document.body.setAttribute("data-page", pageTheme);
    return () => {
      document.body.removeAttribute("data-page");
    };
  }, [pageTheme]);

  return (
    <AppProvider>
      <div className="app-page">
        <div className="page-bg" aria-hidden="true" />
        <Nav />
        <main
          style={{
            flex: 1,
            paddingTop: "6rem",
            maxWidth: "1440px",
            width: "100%",
            margin: "0 auto",
          }}
          className="page-enter"
        >
          {children}
        </main>
        <Footer />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#0a2e2e",
              color: "#f5f5f5",
              border: "1px solid rgba(255,255,255,0.12)",
              fontFamily: "inherit",
              fontSize: "0.85rem",
            },
          }}
        />
      </div>
    </AppProvider>
  );
}
