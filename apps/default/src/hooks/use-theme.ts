import { useTheme as useNextTheme } from 'next-themes';

/**
 * Compatibility shim: LLMs generate `import { useTheme } from '@/hooks/use-theme'`
 * AND typically call it expecting a convenience shape - `const { isDark, toggle } =
 * useTheme()`. next-themes' own hook returns `{ theme, setTheme, resolvedTheme, ... }`
 * with NO `isDark` and NO `toggle`, so a bare re-export left `toggle` undefined and
 * the generated theme button was a dead no-op (golden-path #858). This wrapper returns
 * a SUPERSET: every next-themes field, plus `isDark` and a one-call `toggle`, so both
 * calling styles work.
 *
 * Preferred usage: import { useTheme } from "next-themes" directly, or use this shim.
 */
export function useTheme() {
  const next = useNextTheme();
  const isDark = (next.resolvedTheme ?? next.theme) === 'dark';
  const toggle = () => next.setTheme(isDark ? 'light' : 'dark');
  return { ...next, isDark, toggle };
}
