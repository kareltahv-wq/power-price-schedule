import type { AgentPublicProfile } from './client';

/** A starter chip: a plain string, or a label with the prompt it sends. */
export type AgentChatSuggestion = string | { text: string; prompt: string };

export interface AgentChatAppearanceProps {
  title?: string;
  suggestions?: readonly AgentChatSuggestion[];
  placeholder?: string;
  emptyDescription?: string;
  /** Hex accent for the launcher / accents. */
  accentColor?: string;
  /** Small line under the composer (legal / disclaimer). */
  footerText?: string;
  /** Dismissable banner above the chat. */
  notice?: string;
}

export interface AgentChatAppearance {
  title: string;
  /** `undefined` = let the panel use its generic defaults; `[]` = hide chips. */
  suggestions: readonly AgentChatSuggestion[] | undefined;
  placeholder: string | undefined;
  emptyDescription: string | undefined;
  accentColor: string | undefined;
  /** Readable text color for a surface painted with `accentColor`. */
  accentForeground: string | undefined;
  footerText: string | undefined;
  notice: string | undefined;
  /** The owner's chat button emoji (profile only), or `undefined` for the icon. */
  launcherIcon: string | undefined;
  /** The agent's avatar for the chat header (profile only). */
  avatar: AgentPublicProfile['avatar'] | undefined;
}

export const DEFAULT_AGENT_CHAT_TITLE = 'Assistant';

const HEX_COLOR = /^#?(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const DARK_INK = '#1c1c1c';
const LIGHT_INK = '#ffffff';

function parseHexColor(color: string): [number, number, number] | null {
  const hex = color.trim().replace(/^#/, '');
  const normalized =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  if (normalized.length !== 6) {
    return null;
  }
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return null;
  }
  return [r, g, b];
}

/** WCAG 2.x relative luminance of an sRGB color. */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const linearize = (channel: number): number => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** WCAG contrast ratio between two relative luminances. */
function contrastRatio(a: number, b: number): number {
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

const DARK_INK_LUMINANCE = relativeLuminance([0x1c, 0x1c, 0x1c]);
const LIGHT_INK_LUMINANCE = 1;

/**
 * True when dark ink is the more readable choice on this color, by WCAG
 * contrast against both ink candidates (not a single luminance threshold -
 * Rec. 601 misfires on saturated colors like `#00ff00`, which needs DARK ink
 * despite reading as "dark" on that scale). Anything unparseable reads as dark.
 */
export function isLightHexColor(color: string): boolean {
  const rgb = parseHexColor(color);
  if (rgb == null) {
    return false;
  }
  const luminance = relativeLuminance(rgb);
  return (
    contrastRatio(luminance, DARK_INK_LUMINANCE) >= contrastRatio(luminance, LIGHT_INK_LUMINANCE)
  );
}

export function suggestionLabel(suggestion: AgentChatSuggestion): string {
  return typeof suggestion === 'string' ? suggestion : suggestion.text;
}

export function suggestionPrompt(suggestion: AgentChatSuggestion): string {
  return typeof suggestion === 'string' ? suggestion : suggestion.prompt;
}

/**
 * Merge explicit props over the agent's public profile. Props ALWAYS win, so an
 * app built before the profile existed renders byte-identically; a missing
 * profile (not published yet, network error) yields today's defaults.
 *
 * Suggestions: an explicit prop wins; otherwise the agent's starters; if the
 * owner turned "Show suggestions" off, `[]` hides the chips; an agent with no
 * starters leaves `undefined` so the panel shows its generic defaults.
 */
export function resolveAgentChatDefaults(
  profile: AgentPublicProfile | null | undefined,
  props: AgentChatAppearanceProps,
): AgentChatAppearance {
  const title =
    props.title ?? profile?.preferences.headerTitle ?? profile?.name ?? DEFAULT_AGENT_CHAT_TITLE;

  let suggestions: readonly AgentChatSuggestion[] | undefined = props.suggestions;
  if (suggestions == null && profile != null) {
    if (profile.preferences.showSuggestions === false) {
      suggestions = [];
    } else if (profile.conversationStarters.length > 0) {
      suggestions = profile.conversationStarters;
    }
  }

  const placeholder = props.placeholder ?? profile?.inputPlaceholder ?? undefined;
  const emptyDescription = props.emptyDescription ?? profile?.introduction ?? undefined;

  const rawAccent = props.accentColor ?? profile?.preferences.color ?? undefined;
  // Always '#'-prefixed (same rule as the backend route), so a hashless
  // `ff5500` still yields valid inline CSS instead of being silently ignored.
  const accentColor =
    rawAccent != null && HEX_COLOR.test(rawAccent) ? `#${rawAccent.replace(/^#/, '')}` : undefined;
  const accentForeground =
    accentColor == null ? undefined : isLightHexColor(accentColor) ? DARK_INK : LIGHT_INK;

  const footerText = props.footerText ?? profile?.footerText ?? undefined;
  const notice = props.notice ?? profile?.dismissableNotice ?? undefined;

  // An older gateway sends no launcherIcon key: that reads as no icon.
  const launcherIcon = profile?.preferences.launcherIcon?.value;

  return {
    title,
    suggestions,
    placeholder,
    emptyDescription,
    accentColor,
    accentForeground,
    footerText,
    notice,
    launcherIcon,
    avatar: profile?.avatar ?? undefined,
  };
}
