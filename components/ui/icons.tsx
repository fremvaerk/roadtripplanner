/** Monochrome drive/car glyph for drive-time legs (replaces the 🚗 emoji). */
export function CarIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`inline-block shrink-0 ${className ?? ""}`}
    >
      <path
        d="M4 13.5 5.6 8.4A2.2 2.2 0 0 1 7.7 7h8.6a2.2 2.2 0 0 1 2.1 1.4l1.6 5.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 17v-2.2a1.3 1.3 0 0 1 .9-1.2 31 31 0 0 1 16.2 0 1.3 1.3 0 0 1 .9 1.2V17a1 1 0 0 1-1 1h-1.4a1 1 0 0 1-1-1H6.4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="7.5" cy="15.2" r="0.9" fill="currentColor" />
      <circle cx="16.5" cy="15.2" r="0.9" fill="currentColor" />
    </svg>
  );
}
