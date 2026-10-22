'use client';

import { LogOut, type LucideIcon } from 'lucide-react';
import * as React from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

/** A single section in the portal's top-level nav (rendered as a `Tabs` trigger). */
export interface PortalSection {
  /** Stable id; reported back via `onSectionChange` and matched against `activeSection`. */
  id: string;
  /** Visible nav label. */
  label: string;
  /** Optional leading icon. */
  icon?: LucideIcon;
}

export interface PortalShellProps {
  /** Branded header: a name and an optional logo slot the host fills (img / svg / wordmark). */
  brand: { name: string; logo?: React.ReactNode };
  /**
   * The signed-in viewer, shown in the header (avatar + name). PRESENTATIONAL ONLY -
   * the block does NO auth: the host passes the already-authenticated viewer in.
   * Real identity / privacy is the platform's job (GenesisAuth + gateway scoping).
   */
  viewer?: { name: string; email?: string; avatarUrl?: string };
  /** Top-level nav sections. */
  sections: PortalSection[];
  /** Controlled active section id; falls back to the first section when unset. */
  activeSection?: string;
  /** Section-change callback (controlled nav). When absent, nav is display-only. */
  onSectionChange?: (id: string) => void;
  /** Sign-out callback. When absent, the sign-out affordance is hidden. */
  onSignOut?: () => void;
  /**
   * Render the "Showing your records" honesty note above the content. Default true.
   * Mirrors the RecordsTable owner-filter disclosure verbatim - a DISPLAY-ONLY
   * convenience, NOT a security boundary (see copy below).
   */
  showOwnerNote?: boolean;
  /** Host-filled content region (owner-filtered RecordsTable / StatusTracker / InvoiceCard). */
  children: React.ReactNode;
  className?: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Derive up-to-two-letter initials for the avatar fallback. Pure. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * Client / member-portal layout frame - the largest David sub-segment (clinic,
 * L&D, realtor, vessel, onboarding). Wraps a branded header, a section nav, an
 * optional greeting, the owner-filter honesty note, and a host-filled `children`
 * content slot (typically an owner-filtered RecordsTable / StatusTracker / InvoiceCard).
 *
 * NO auth logic lives here: the viewer is passed in already-authenticated. Real
 * per-user privacy is the platform's responsibility (GenesisAuth + gateway row
 * scoping). Token-only, presentational, props-driven.
 */
export function PortalShell({
  brand,
  viewer,
  sections,
  activeSection,
  onSectionChange,
  onSignOut,
  showOwnerNote = true,
  children,
  className,
}: PortalShellProps) {
  const active = activeSection ?? sections[0]?.id;

  return (
    <div
      data-genesis-block="portal-shell"
      className={cn('bg-background text-foreground min-h-full', className)}
    >
      {/* Branded header: logo slot + brand name on the left, viewer + sign-out on the right. */}
      <header className="bg-card text-card-foreground border-b">
        <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            {brand.logo ? (
              <div className="flex size-9 shrink-0 items-center justify-center">{brand.logo}</div>
            ) : null}
            <span className="text-foreground text-base font-semibold tracking-tight">
              {brand.name}
            </span>
          </div>

          {viewer ? (
            <div className="flex items-center gap-3">
              <div className="hidden flex-col items-end leading-tight sm:flex">
                <span className="text-foreground text-sm font-medium">{viewer.name}</span>
                {viewer.email ? (
                  <span className="text-muted-foreground text-xs">{viewer.email}</span>
                ) : null}
              </div>
              <Avatar>
                {viewer.avatarUrl ? <AvatarImage src={viewer.avatarUrl} alt={viewer.name} /> : null}
                <AvatarFallback className="text-xs font-medium">
                  {initials(viewer.name)}
                </AvatarFallback>
              </Avatar>
              {onSignOut ? (
                <Button variant="ghost" size="icon-sm" onClick={onSignOut} aria-label="Sign out">
                  <LogOut className="size-4" aria-hidden />
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Section nav. Controlled when `onSectionChange` is provided; otherwise display-only. */}
        {sections.length > 0 ? (
          <div className="px-4 pb-3 sm:px-6">
            <Tabs value={active} onValueChange={onSectionChange}>
              <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
                {sections.map((section) => {
                  const SectionIcon = section.icon;
                  return (
                    <TabsTrigger key={section.id} value={section.id}>
                      {SectionIcon ? <SectionIcon className="size-4" aria-hidden /> : null}
                      {section.label}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>
          </div>
        ) : null}
      </header>

      <main className="px-4 py-6 sm:px-6">
        {viewer ? (
          <div className="mb-4 flex items-center gap-2">
            <h1 className="text-foreground text-xl font-semibold tracking-tight">
              Welcome back, {viewer.name.split(/\s+/)[0]}
            </h1>
            <Badge variant="secondary" className="font-normal">
              Member portal
            </Badge>
          </div>
        ) : null}

        {showOwnerNote ? (
          // Owner-filter honesty note. REUSED VERBATIM from the RecordsTable
          // owner-filter disclosure - a DISPLAY-ONLY convenience, NOT a security
          // boundary. Token-only: text-muted-foreground, no palette / #hex.
          <Card className="bg-card text-card-foreground mb-4">
            <CardContent className="py-3">
              <p className="text-muted-foreground text-xs">
                Showing your records.{' '}
                <span className="opacity-80">
                  Display-only convenience - not a security boundary. Per-user privacy needs Private
                  per-user data, which the app owner turns on in the Publish menu.
                </span>
              </p>
            </CardContent>
          </Card>
        ) : null}

        <Separator className="mb-6" />

        {/* Host-filled content region (owner-filtered RecordsTable / StatusTracker / InvoiceCard). */}
        <div className="bg-accent/30 rounded-xl">{children}</div>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ICP-grounded default sections (David service-pro client portal)     */
/* The canonical client/member-portal nav for the EV-07 cohort.        */
/* ------------------------------------------------------------------ */

/**
 * Default client-portal nav for the David service-pro cohort (clinic, L&D, realtor,
 * vessel, onboarding all share this member-facing shape): Overview / My Jobs /
 * Invoices / Messages. Icon-free so hosts can attach their own `lucide` icons;
 * pass a customized `sections` array to override.
 */
export const CLIENT_PORTAL_SECTIONS: PortalSection[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'jobs', label: 'My Jobs' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'messages', label: 'Messages' },
];
