/**
 * A collapse/expand chevron — points right when closed, rotates down when open.
 * Replaces the near-invisible ▸/▾ text glyphs with a clear, consistent icon.
 */
export function Chevron({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 transition-transform duration-150 ${open ? "rotate-90" : ""} ${className ?? ""}`}
    >
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
