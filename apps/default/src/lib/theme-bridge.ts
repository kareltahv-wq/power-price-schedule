/**
 * Live theme preview for the Taskade editor (theme bridge version 2). Do not
 * edit: the editor's Theme & Brand panel depends on this exact protocol.
 *
 * Messages from the parent editor:
 * - TASKADE_THEME_UPDATE `{ vars, darkVars? }`: overrides for `:root` (vars)
 *   and `.dark`. With `darkVars`, `.dark` gets exactly those values. Without
 *   it, `.dark` gets values derived from `vars`. Empty maps remove every
 *   override, so the app shows its own CSS again.
 * - TASKADE_THEME_HELLO: asks for the bridge version and the current mode.
 * - TASKADE_THEME_READ `{ keys }`: asks for the computed values of `keys`.
 *
 * Messages to the parent editor:
 * - TASKADE_THEME_APPLIED `{ bridgeVersion, mode }` after each update.
 * - TASKADE_THEME_INFO `{ bridgeVersion, mode }` in reply to HELLO. A bridge
 *   that does not reply is version 1.
 * - TASKADE_THEME_MODE `{ mode }` when the app switches light and dark.
 * - TASKADE_THEME_CURRENT `{ vars }` in reply to READ.
 *
 * Overrides go into one <style> element (not inline styles), so both the
 * `:root` (light) and `.dark` selectors apply.
 */

const THEME_STYLE_ID = 'taskade-theme-overrides';
const THEME_BRIDGE_VERSION = 2;

/** The mode the app renders now: next-themes puts `dark` on <html>. */
function currentMode(): 'dark' | 'light' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

/**
 * Parse an HSL string "H S% L%" into its numeric components.
 */
function parseHsl(hsl: string): { h: number; s: number; l: number } | null {
  const parts = hsl.trim().split(/\s+/);
  if (parts.length < 3) {
    return null;
  }
  const h = parseFloat(parts[0]!);
  const s = parseFloat(parts[1]!);
  const l = parseFloat(parts[2]!);
  if (isNaN(h) || isNaN(s) || isNaN(l)) {
    return null;
  }
  return { h, s, l };
}

/**
 * Derive a dark-mode HSL value from a light-mode HSL value based on the
 * CSS variable role. Returns a new "H S% L%" string.
 */
function deriveDarkValue(key: string, hsl: string): string {
  const parsed = parseHsl(hsl);
  if (parsed == null) {
    return hsl;
  }
  const { h, s, l } = parsed;

  // Non-color variables — pass through unchanged
  if (key === '--radius') {
    return hsl;
  }

  // Derive dark-mode lightness based on the variable's role
  let darkL: number;
  let darkS = s;

  if (['--background', '--card', '--popover'].includes(key)) {
    // Light backgrounds → very dark
    darkL = Math.max(3, Math.min(8, 100 - l));
  } else if (['--foreground', '--card-foreground', '--popover-foreground'].includes(key)) {
    // Dark foregrounds → very light
    darkL = Math.min(95, Math.max(85, 100 - l));
  } else if (key === '--primary') {
    // Invert: dark primary in light → light primary in dark
    darkL = l <= 50 ? Math.min(98, 100 - l) : Math.max(2, 100 - l);
  } else if (key === '--primary-foreground') {
    darkL = l > 50 ? Math.max(2, 100 - l) : Math.min(98, 100 - l);
  } else if (['--accent', '--muted', '--border', '--input', '--ring'].includes(key)) {
    // Light accents/muted → dark equivalents
    darkL = Math.max(10, Math.min(20, 100 - l));
    darkS = Math.min(s, 50);
  } else if (key === '--accent-foreground' || key === '--muted-foreground') {
    darkL = Math.min(98, Math.max(55, 100 - l));
  } else if (key === '--secondary' || key === '--secondary-foreground') {
    darkL = l > 50 ? Math.max(8, 100 - l) : Math.min(98, 100 - l);
  } else if (key === '--destructive') {
    darkL = Math.max(25, l * 0.65);
    darkS = Math.min(s, 70);
  } else if (key === '--destructive-foreground') {
    darkL = Math.min(98, Math.max(90, 100 - l));
  } else {
    // Default: invert lightness
    darkL = 100 - l;
  }

  return `${h} ${darkS}% ${Math.round(darkL)}%`;
}

/**
 * Build CSS text for the given vars targeting a specific selector.
 */
function buildCssBlock(selector: string, vars: Record<string, string>): string {
  const declarations = Object.entries(vars)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join('\n');
  return `${selector} {\n${declarations}\n}`;
}

/** The string values of a message map. An empty value means "no override". */
function readOverrides(vars: unknown): Record<string, string> {
  const overrides: Record<string, string> = {};
  if (vars == null || typeof vars !== 'object') {
    return overrides;
  }
  for (const [key, value] of Object.entries(vars as Record<string, unknown>)) {
    if (typeof value === 'string' && value !== '') {
      overrides[key] = value;
    }
  }
  return overrides;
}

function postToEditor(type: string, data: Record<string, unknown>) {
  window.parent.postMessage({ type, data }, '*');
}

export function setupThemeBridge() {
  window.addEventListener('message', (event) => {
    // Only accept messages from the parent frame
    if (event.source !== window.parent) {
      return;
    }

    if (event.data?.type === 'TASKADE_THEME_UPDATE') {
      const vars: Record<string, string> | undefined = event.data.data?.vars;
      if (vars == null) {
        return;
      }
      const explicitDarkVars: unknown = event.data.data?.darkVars;

      const lightVars = readOverrides(vars);
      // Explicit dark values win verbatim. Without them, derive `.dark` from
      // the light values (bridge version 1 behavior).
      const darkVars: Record<string, string> =
        explicitDarkVars != null
          ? readOverrides(explicitDarkVars)
          : Object.fromEntries(
              Object.entries(lightVars).map(([key, value]) => [key, deriveDarkValue(key, value)]),
            );

      // Inject or update the <style> element
      let styleEl = document.getElementById(THEME_STYLE_ID) as HTMLStyleElement | null;
      const blocks: string[] = [];
      if (Object.keys(lightVars).length > 0) {
        // Two-mode (explicit dark values): light edits apply to light mode
        // only. A plain `:root` block comes after the app CSS and wins over the
        // app's `.dark`, so a light edit changed the dark preview too.
        blocks.push(
          buildCssBlock(explicitDarkVars != null ? ':root:not(.dark)' : ':root', lightVars),
        );
      }
      if (Object.keys(darkVars).length > 0) {
        blocks.push(buildCssBlock('.dark', darkVars));
      }

      if (blocks.length === 0) {
        // No overrides: remove the style element entirely
        styleEl?.remove();
      } else {
        if (styleEl == null) {
          styleEl = document.createElement('style');
          styleEl.id = THEME_STYLE_ID;
          document.head.appendChild(styleEl);
        }
        styleEl.textContent = blocks.join('\n\n');
      }

      postToEditor('TASKADE_THEME_APPLIED', {
        bridgeVersion: THEME_BRIDGE_VERSION,
        mode: currentMode(),
      });
      return;
    }

    if (event.data?.type === 'TASKADE_THEME_HELLO') {
      postToEditor('TASKADE_THEME_INFO', {
        bridgeVersion: THEME_BRIDGE_VERSION,
        mode: currentMode(),
      });
      return;
    }

    if (event.data?.type === 'TASKADE_THEME_READ') {
      const keys: string[] | undefined = event.data.data?.keys;
      if (keys == null) {
        return;
      }

      const computed = getComputedStyle(document.documentElement);
      const vars: Record<string, string> = {};
      for (const key of keys) {
        const val = computed.getPropertyValue(key).trim();
        if (val) {
          vars[key] = val;
        }
      }

      postToEditor('TASKADE_THEME_CURRENT', { vars });
      return;
    }
  });

  // The app's own light and dark toggle flips the `dark` class on <html>.
  // Tell the editor, so its theme panel follows the mode on screen.
  let lastMode = currentMode();
  new MutationObserver(() => {
    const mode = currentMode();
    if (mode === lastMode) {
      return;
    }
    lastMode = mode;
    postToEditor('TASKADE_THEME_MODE', { mode });
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
}
