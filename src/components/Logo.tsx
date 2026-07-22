/**
 * Brand mark — a résumé page with an AI spark on the corner ("Spark Doc").
 * The page inherits `currentColor` (so it takes the surrounding text color) and
 * the spark uses the brand primary. Size via className, e.g. `size-5`.
 */
export default function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {/* page */}
      <path
        d="M8 4h8l7 7v15a2.5 2.5 0 0 1-2.5 2.5H8A2.5 2.5 0 0 1 5.5 26V6.5A2.5 2.5 0 0 1 8 4Z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {/* folded corner */}
      <path
        d="M16 4v5a2 2 0 0 0 2 2h5"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {/* text lines */}
      <path
        d="M10 17h7M10 21h9M10 25h5.5"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0.4}
      />
      {/* AI spark */}
      <path
        d="M23 2 24.35 5.65 28 7 24.35 8.35 23 12 21.65 8.35 18 7 21.65 5.65Z"
        className="fill-primary"
        stroke="var(--background)"
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
    </svg>
  );
}
