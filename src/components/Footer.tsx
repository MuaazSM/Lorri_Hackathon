import { footer } from "@/content/copy";

export function Footer() {
  return (
    <footer className="border-t border-white/20">
      <div className="mx-auto max-w-[1280px] px-6 lg:px-10 pt-16 pb-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-12 lg:gap-24">
          {/* Brand column */}
          <div className="max-w-[320px]">
            <p className="text-2xl font-semibold text-white mb-3">
              {footer.brand}
            </p>
            <p className="text-sm text-[#7f7f7f]">{footer.tagline}</p>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 lg:gap-12">
            {footer.columns.map((column) => (
              <div key={column.title}>
                <span className="font-mono text-xs uppercase tracking-wider text-white mb-4 block">
                  {column.title}
                </span>
                <ul className="space-y-3">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-sm text-[#7f7f7f] hover:text-white transition-colors duration-200"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-16 pt-8 border-t border-white/10">
          <p className="text-xs text-[#7f7f7f]">{footer.copyright}</p>
        </div>
      </div>
    </footer>
  );
}
