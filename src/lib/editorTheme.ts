// Theme-aware colors for the inline-styled editor components. Reference the
// shadcn CSS variables so inline styles adapt to light/dark.
export const ec = {
  card: "var(--card)",
  bg: "var(--background)",
  border: "var(--border)",
  muted: "var(--muted)",
  fg: "var(--foreground)",
  mutedFg: "var(--muted-foreground)",
  faint: "var(--muted-foreground)",
  primary: "var(--primary)",
  primaryFg: "var(--primary-foreground)",
  primaryTint: "color-mix(in srgb, var(--primary) 14%, transparent)",
  destructive: "var(--destructive)",
  destructiveTint: "color-mix(in srgb, var(--destructive) 14%, transparent)",
  destructiveBorder: "color-mix(in srgb, var(--destructive) 45%, transparent)",
  ring: "var(--ring)",
} as const;
