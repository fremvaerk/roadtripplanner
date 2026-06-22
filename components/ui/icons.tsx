import type { ReactNode } from "react";

/** Map-pin glyph, for placeholders (e.g. a trip cover with no photo). */
export function PinIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`inline-block shrink-0 ${className ?? ""}`}
    >
      <path
        d="M12 21s6.5-5.8 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15.2 12 21 12 21Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10.5" r="2.4" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/** Navigation arrow for "Navigate" / open-in-Maps links. */
export function NavigateIcon({ className }: { className?: string }) {
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
        d="M21 3 3 10.5l7.3 2.2L12.5 20 21 3Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Shared wrapper so all the menu/action glyphs share size + stroke style. */
function Glyph({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`inline-block shrink-0 ${className ?? ""}`}
    >
      {children}
    </svg>
  );
}

/** Gear icon for trip settings. */
export function SettingsIcon({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </Glyph>
  );
}

/** Share (node graph). */
export function ShareIcon({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="M8.2 10.7l7.6-4.4M8.2 13.3l7.6 4.4" />
    </Glyph>
  );
}

/** Download / export. */
export function DownloadIcon({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <path d="M12 3v12" />
      <path d="M7 11l5 5 5-5" />
      <path d="M5 20h14" />
    </Glyph>
  );
}

/** Archive box. */
export function ArchiveIcon({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <path d="M10 12h4" />
    </Glyph>
  );
}

/** Restore (counter-clockwise arrow). */
export function RestoreIcon({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <path d="M3 8a9 9 0 1 1-1.6 5" />
      <path d="M3 3v5h5" />
    </Glyph>
  );
}

/** Trash / remove. */
export function TrashIcon({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    </Glyph>
  );
}

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
