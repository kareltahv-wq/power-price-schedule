'use client';

import { useChat } from '@ai-sdk/react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ulid } from 'ulidx';

import {
  AIAssistantPanel,
  type AIAssistantLabels,
} from '@/components/blocks/ai-assistant/AIAssistantPanel';
import { Button } from '@/components/ui/button';
import {
  createAgentChat,
  createConversation,
  getAgentProfile,
  resolveAgentChatDefaults,
  resolveChatErrorMessage,
  type AgentChatSuggestion,
  type AgentPublicProfile,
} from '@/lib/agent-chat/v2';
import { cn } from '@/lib/utils';

/** Literal accent classes so the Tailwind JIT scan (.tsx only) emits them. */
const ACCENT_BG = {
  1: 'bg-chart-1',
  2: 'bg-chart-2',
  3: 'bg-chart-3',
  4: 'bg-chart-4',
  5: 'bg-chart-5',
} as const;

/** Literal corner classes (launcher, desktop panel), for the same reason. */
const CORNER_CLASSES = {
  'bottom-right': { launcher: 'right-6', panel: 'sm:right-6' },
  'bottom-left': { launcher: 'left-6', panel: 'sm:left-6' },
} as const;

type AgentChat = ReturnType<typeof createAgentChat>;

export interface FloatingAgentChatProps {
  /**
   * SpaceAgent id from the manage_agent CreateAgent result (the value after
   * "The new agent id is"). Drives the in-app SDK. NOT the id from the /a/...
   * public URL - that one 404s against the SDK.
   */
  agentId?: string;
  /**
   * Trailing segment of the /a/{publicAgentId} public URL. Drives the hosted
   * iframe fallback (and the "Open hosted chat" escape hatch on SDK errors).
   */
  publicAgentId?: string;
  /**
   * Header + launcher label. Defaults to the agent's custom header title or
   * its name (from the agent's public profile).
   */
  title?: string;
  /** Chart-token index for the launcher color; wins over the agent's accent. */
  accent?: 1 | 2 | 3 | 4 | 5;
  /**
   * Hex accent for the launcher. Defaults to the agent's Customize color; a
   * chart-token `accent` wins over both.
   */
  accentColor?: string;
  /**
   * Starter prompt chips. Defaults to the agent's own conversation starters;
   * hidden when the owner turned "Show suggestions" off.
   */
  suggestions?: readonly AgentChatSuggestion[];
  /** Composer placeholder. Defaults to the agent's input placeholder. */
  placeholder?: string;
  /** Empty-state copy. Defaults to the agent's welcome message. */
  emptyDescription?: string;
  /** Small line under the composer. Defaults to the agent's footer text. */
  footerText?: string;
  /** Dismissable banner above the chat. Defaults to the agent's notice. */
  notice?: string;
  /**
   * Machinery strings for the panel and this shell (close, retry, connecting).
   * Partial; every key falls back to English. Pass it from the app's own
   * dictionary on a multilingual app - it is the only way these strings change,
   * because blocks are never forked.
   */
  labels?: Partial<FloatingAgentChatLabels>;
  /**
   * Corner for the launcher and the desktop panel. On a phone the open panel
   * fills the screen in both cases. Use `bottom-left` when the app's own
   * control or sticky call to action sits in the bottom-right corner.
   */
  position?: 'bottom-right' | 'bottom-left';
  defaultOpen?: boolean;
  className?: string;
}

export interface FloatingAgentChatLabels extends AIAssistantLabels {
  /**
   * aria-label of the closed launcher. The only key with no static default:
   * absent, it reads "Open <title>" so screen readers still hear the agent's
   * name, and a localized app passes its own complete phrase.
   */
  openChat?: string;
  /** aria-label of the header close button. */
  closeChat: string;
  /** Copy above the retry button when the SDK chat failed to start. */
  warmingUp: string;
  /** Retry button. */
  tryAgain: string;
  /** Escape-hatch link to the hosted /a/ page. */
  openHostedChat: string;
  /** Shown while the SDK chat is starting. */
  connecting: string;
}

const DEFAULT_SHELL_LABELS: Omit<FloatingAgentChatLabels, keyof AIAssistantLabels | 'openChat'> = {
  closeChat: 'Close chat',
  warmingUp: 'The assistant is warming up - try again.',
  tryAgain: 'Try again',
  openHostedChat: 'Open hosted chat',
  connecting: 'Connecting...',
};

/**
 * FloatingAgentChat - the complete floating agent chat: launcher button,
 * mobile-responsive panel, Agent Chat SDK v2 wiring (lazy conversation
 * creation, two-component useChat split), a friendly error/retry state, and
 * a hosted-chat iframe fallback when only a publicAgentId is available.
 *
 * Appearance comes from the agent itself: the block reads the agent's public
 * profile (name / header title, starters, placeholder, welcome message, accent)
 * so it matches the hosted /a/ page and the website widget without any props.
 * Every prop is an override and always wins.
 *
 * Sanctioned exception to the blocks "no network" rule: it delegates ALL
 * network to @/lib/agent-chat/v2 and never hand-rolls a fetch.
 */
export function FloatingAgentChat({
  agentId,
  publicAgentId,
  title,
  accent,
  accentColor,
  suggestions,
  placeholder,
  emptyDescription,
  footerText,
  notice,
  labels,
  position = 'bottom-right',
  defaultOpen = false,
  className,
}: FloatingAgentChatProps) {
  const shellLabels = { ...DEFAULT_SHELL_LABELS, ...labels };
  const [open, setOpen] = useState(defaultOpen);
  const [chat, setChat] = useState<AgentChat | null>(null);
  const [chatError, setChatError] = useState(false);
  const [starting, setStarting] = useState(false);
  const [profile, setProfile] = useState<AgentPublicProfile | null>(null);

  const sdkMode = agentId != null && agentId !== '';
  // The profile route accepts the internal or the public id, so a hosted
  // fallback (publicAgentId only) also gets the owner's appearance.
  const profileAgentId = sdkMode ? agentId : publicAgentId;

  // One read per mount. A failure (unpublished agent, offline) just keeps the
  // prop/default appearance - the chat itself is unaffected.
  useEffect(() => {
    if (profileAgentId == null || profileAgentId === '') {
      return;
    }
    let cancelled = false;
    getAgentProfile(profileAgentId)
      .then((loaded) => {
        if (!cancelled) {
          setProfile(loaded);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [profileAgentId]);

  const appearance = resolveAgentChatDefaults(profile, {
    title,
    suggestions,
    placeholder,
    emptyDescription,
    accentColor,
    footerText,
    notice,
  });
  const resolvedTitle = appearance.title;
  const hostedUrl =
    publicAgentId != null && publicAgentId !== ''
      ? `https://www.taskade.com/a/${encodeURIComponent(publicAgentId)}`
      : null;

  const startChat = useCallback(async () => {
    if (!sdkMode || chat != null || starting) {
      return;
    }
    setStarting(true);
    try {
      const { conversationId } = await createConversation(agentId);
      setChat(createAgentChat(agentId, conversationId));
      setChatError(false);
    } catch {
      // Never let a 404/503 white-screen the app - keep the panel rendered
      // with a visible retry state (and a hosted-chat escape hatch).
      setChatError(true);
    } finally {
      setStarting(false);
    }
  }, [sdkMode, chat, starting, agentId]);

  // defaultOpen renders the panel without a launcher click, so handleOpen never
  // fires and the panel would sit on "Connecting..." forever. Start the
  // conversation from here too. startChat's own guards prevent double-starts;
  // skipping on chatError keeps failures on the manual "Try again" button
  // instead of an auto-retry loop.
  useEffect(() => {
    if (open && sdkMode && chat == null && !chatError && !starting) {
      void startChat();
    }
  }, [open, sdkMode, chat, chatError, starting, startChat]);

  // Nothing to chat with: render nothing rather than a dead launcher.
  if (!sdkMode && hostedUrl == null) {
    return null;
  }

  const corner = CORNER_CLASSES[position] ?? CORNER_CLASSES['bottom-right'];

  const handleOpen = () => {
    setOpen(true);
    void startChat();
  };

  return (
    <>
      <AnimatePresence>
        {open ? (
          <>
            {/* Tap-to-dismiss backdrop, mobile only. */}
            <div
              className="bg-foreground/20 fixed inset-0 z-40 sm:hidden"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <motion.div
              data-genesis-block="floating-agent-chat"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className={cn(
                'fixed inset-0 z-50 h-full w-full sm:inset-auto sm:bottom-6 sm:h-[600px] sm:w-[400px]',
                corner.panel,
                className,
              )}
            >
              <div className="bg-card text-card-foreground flex h-full flex-col overflow-hidden border shadow-lg sm:rounded-xl">
                {/* The ONE header of the chat. The panel below gets
                    `hideHeader`, so the title never shows twice. */}
                <div className="flex items-center gap-2 border-b py-2 pl-4 pr-2">
                  <AgentAvatarChip avatar={appearance.avatar} />
                  <span className="text-foreground min-w-0 flex-1 truncate text-sm font-semibold">
                    {resolvedTitle}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setOpen(false)}
                    aria-label={shellLabels.closeChat}
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                </div>

                {sdkMode && chat != null ? (
                  <ActiveChat
                    chat={chat}
                    title={resolvedTitle}
                    suggestions={appearance.suggestions}
                    placeholder={appearance.placeholder}
                    emptyDescription={appearance.emptyDescription}
                    footerText={appearance.footerText}
                    notice={appearance.notice}
                    labels={labels}
                  />
                ) : sdkMode && chatError ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                    <p className="text-muted-foreground text-sm">{shellLabels.warmingUp}</p>
                    <Button onClick={() => void startChat()} disabled={starting}>
                      {shellLabels.tryAgain}
                    </Button>
                    {hostedUrl != null ? (
                      <a
                        href={hostedUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground text-xs underline"
                      >
                        {shellLabels.openHostedChat}
                      </a>
                    ) : null}
                  </div>
                ) : sdkMode ? (
                  <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
                    {shellLabels.connecting}
                  </div>
                ) : hostedUrl != null ? (
                  <iframe
                    src={hostedUrl}
                    title={resolvedTitle}
                    allow="clipboard-read; clipboard-write"
                    className="h-full w-full flex-1 border-0"
                  />
                ) : null}
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

      {!open ? (
        <Button
          onClick={handleOpen}
          data-genesis-block="floating-agent-chat"
          data-genesis-chat
          aria-label={labels?.openChat ?? `Open ${resolvedTitle}`}
          className={cn(
            'fixed bottom-6 z-50 size-14 rounded-full shadow-lg',
            corner.launcher,
            accent != null ? ACCENT_BG[accent] : 'bg-primary text-primary-foreground',
          )}
          // A chart-token accent keeps its class; otherwise the agent's (or the
          // accentColor prop's) hex tints the launcher inline, with a
          // luminance-picked icon color so it stays readable on light brands.
          style={
            accent == null && appearance.accentColor != null
              ? { backgroundColor: appearance.accentColor, color: appearance.accentForeground }
              : undefined
          }
        >
          {appearance.launcherIcon != null ? (
            <span className="text-2xl leading-none" aria-hidden>
              {appearance.launcherIcon}
            </span>
          ) : (
            <MessageCircle className="size-6" aria-hidden />
          )}
        </Button>
      ) : null}
    </>
  );
}

/**
 * The agent's avatar in the chat header: the owner's emoji or image from the
 * public profile, else a sparkles glyph. All three sit in the same small round
 * chip, so the header keeps one height. A broken image URL falls back to the
 * glyph.
 */
function AgentAvatarChip({ avatar }: { avatar: AgentPublicProfile['avatar'] | undefined }) {
  const imageUrl = avatar?.type === 'image' ? avatar.url : null;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const chipClass =
    'bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full';
  if (imageUrl != null && imageUrl !== failedUrl) {
    return (
      <span className={chipClass} data-genesis-chat-avatar="image">
        <img
          src={imageUrl}
          alt=""
          className="size-full object-cover"
          onError={() => setFailedUrl(imageUrl)}
        />
      </span>
    );
  }
  if (avatar?.type === 'emoji') {
    return (
      <span
        className={cn(chipClass, 'text-base leading-none')}
        data-genesis-chat-avatar="emoji"
        aria-hidden
      >
        {avatar.value}
      </span>
    );
  }
  return (
    <span className={chipClass} data-genesis-chat-avatar="glyph" aria-hidden>
      <Sparkles className="size-3.5" aria-hidden />
    </span>
  );
}

/**
 * Inner component so useChat only ever mounts with a REAL Chat instance
 * (useChat crashes if passed undefined - the mandatory two-component split).
 */
function ActiveChat({
  chat,
  title,
  suggestions,
  placeholder,
  emptyDescription,
  footerText,
  notice,
  labels,
}: {
  chat: AgentChat;
  title: string;
  suggestions?: readonly AgentChatSuggestion[];
  placeholder?: string;
  emptyDescription?: string;
  footerText?: string;
  notice?: string;
  labels?: Partial<AIAssistantLabels>;
}) {
  const { messages, status, stop, error, clearError, regenerate, addToolApprovalResponse } =
    useChat({
      chat,
      id: chat.id,
      // Matches useAiSdkChat.ts: coalesce stream-part re-renders to ~frame rate.
      experimental_throttle: 16,
    });
  const busy = status === 'submitted' || status === 'streaming';

  // Shows the SERVER's message (already end-user-safe and specific about the
  // recovery) instead of a generic line of our own. See resolveChatErrorMessage.
  const errorMessage = resolveChatErrorMessage(error);

  const handleRetry = useCallback(() => {
    clearError();
    // Re-runs the failed turn: a trailing user message is resent as-is, a
    // half-written assistant message is dropped first. Rejections land back in
    // `error` and re-render the same line, so nothing is swallowed.
    void regenerate().catch(() => {});
  }, [clearError, regenerate]);

  const handleSend = async (text: string) => {
    try {
      await chat.sendMessage({
        id: ulid(),
        role: 'user',
        parts: [{ type: 'text', text }],
      });
    } catch {
      // NOT swallowed: send/stream failures land in useChat's `error`, which is
      // rendered via errorMessage below. This catch only keeps the rejection
      // out of the submit handler.
    }
  };

  return (
    <AIAssistantPanel
      messages={messages}
      onSend={handleSend}
      busy={busy}
      status={status}
      onStop={stop}
      errorMessage={errorMessage}
      onRetry={handleRetry}
      onApprove={(id, approved) => addToolApprovalResponse({ id, approved })}
      title={title}
      suggestions={suggestions}
      placeholder={placeholder}
      emptyDescription={emptyDescription}
      footerText={footerText}
      notice={notice}
      labels={labels}
      // The shell above draws the header. The panel draws none, and its empty
      // greeting sits at the bottom, next to the chips and the composer.
      hideHeader
      emptyStateAlign="end"
      className="rounded-none border-0 shadow-none"
    />
  );
}
