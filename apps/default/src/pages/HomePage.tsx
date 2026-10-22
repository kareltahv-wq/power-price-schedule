import { useEffect, useMemo, useState } from 'react';
import { FloatingAgentChat } from '@/components/blocks';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getFieldNumber, getFieldValue, getTitle } from '@/lib/genesis-data';
import { useLiveNodes } from '@/hooks/use-live-nodes';
import { Activity, Clock3, Moon, PlugZap, RefreshCw, Sun } from '@/lib/icons';
import { useTheme } from 'next-themes';

const CONTROL_PROJECT_ID = 'f8VQC8T3RaCt9MKW';
const AGENT_ID = '01M5FERQVV83V54M54ST86EGCT';
const PUBLIC_AGENT_ID = 'estonia-energy-guide-01M5FERQVYZPBV3PNYN3CAB2SA';
const SETTINGS_TITLE = 'Daily control defaults';
const TIME_TICKS = ['00:00', '06:00', '12:00', '18:00', '24:00'];

function formatEstoniaDate(timezone: string) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Tallinn',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date());
  }
}

function StatusCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <section className="bg-card flex min-w-0 items-start gap-4 rounded-xl border p-5 shadow-sm">
      <span className="bg-muted text-muted-foreground flex size-11 shrink-0 items-center justify-center rounded-lg">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-[0.14em]">{label}</p>
        <p className="mt-1 truncate text-lg font-semibold tabular-nums">{value}</p>
        <p className="text-muted-foreground mt-1 text-sm leading-5">{detail}</p>
      </div>
    </section>
  );
}

function DailyPriceGraph() {
  return (
    <section aria-labelledby="daily-graph-title" className="bg-card overflow-hidden rounded-2xl border shadow-sm">
      <div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-start sm:justify-between sm:p-7">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg">
              <Activity className="size-4" aria-hidden />
            </span>
            <p className="text-muted-foreground text-xs font-semibold uppercase tracking-[0.16em]">Market day</p>
          </div>
          <h2 id="daily-graph-title" className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
            Daily price curve
          </h2>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
            Estonia day-ahead electricity prices, shown as individual 15-minute periods.
          </p>
        </div>
        <span className="border-border text-muted-foreground inline-flex min-h-10 shrink-0 items-center gap-2 self-start rounded-full border px-3 text-xs font-medium">
          <span className="size-2 rounded-full bg-muted-foreground/60" aria-hidden />
          Price feed not connected
        </span>
      </div>

      <div className="p-4 sm:p-7">
        <div className="flex min-h-[340px] sm:min-h-[390px]">
          <div className="text-muted-foreground flex w-8 shrink-0 items-center justify-center pb-9 text-[11px] sm:w-10">
            <span className="-rotate-90 whitespace-nowrap">Market price · c/kWh</span>
          </div>
          <div className="min-w-0 flex-1">
            <div
              role="img"
              aria-label="Empty daily electricity price graph. No price intervals are connected yet."
              className="relative h-[300px] overflow-hidden rounded-lg border bg-background sm:h-[350px]"
            >
              <div
                className="pointer-events-none absolute inset-0"
                aria-hidden="true"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, hsl(var(--border) / 0.55) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border) / 0.55) 1px, transparent 1px)',
                  backgroundSize: '25% 25%',
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center p-5">
                <div className="bg-card/95 max-w-sm rounded-xl border px-6 py-5 text-center shadow-sm backdrop-blur-sm">
                  <span className="bg-muted text-muted-foreground mx-auto flex size-11 items-center justify-center rounded-full">
                    <Activity className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-3 text-base font-semibold">Waiting for price data</h3>
                  <p className="text-muted-foreground mt-2 text-sm leading-6">
                    No price intervals are being received yet. The curve and high-price periods will appear here once a verified feed is connected.
                  </p>
                </div>
              </div>
            </div>
            <div className="text-muted-foreground mt-3 grid grid-cols-5 text-[11px] tabular-nums sm:text-xs">
              {TIME_TICKS.map((tick, index) => (
                <span key={tick} className={index === 0 ? 'text-left' : index === TIME_TICKS.length - 1 ? 'text-right' : 'text-center'}>
                  {tick}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="text-muted-foreground mt-5 flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs">
          <span>Each plotted point will represent one 15-minute market period.</span>
          <span>Displayed market prices include VAT.</span>
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  const { nodes, loading, error, updatedAt, refresh } = useLiveNodes(CONTROL_PROJECT_ID);
  const { resolvedTheme, setTheme } = useTheme();
  const [themeReady, setThemeReady] = useState(false);

  useEffect(() => {
    document.title = 'Estonia Energy';
    setThemeReady(true);
  }, []);

  const settings = useMemo(
    () => nodes.find((node) => getTitle(node)?.trim() === SETTINGS_TITLE) ?? nodes[0],
    [nodes],
  );
  const targetShare = settings
    ? getFieldNumber(settings, 'Target share', '/attributes/@pct30')
    : null;
  const timezone = settings
    ? getFieldValue(settings, 'Timezone', '/attributes/@tz001') ?? 'Europe/Tallinn'
    : 'Europe/Tallinn';
  const marketDate = formatEstoniaDate(timezone);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
              <PlugZap className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Estonia Energy</p>
              <p className="text-muted-foreground hidden text-xs sm:block">Electricity price control</p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="min-h-11 min-w-11"
            aria-label={resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            disabled={!themeReady}
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          >
            {resolvedTheme === 'dark' ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-muted-foreground text-xs font-semibold uppercase tracking-[0.18em]">Estonia · {marketDate}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Electricity, at a glance</h1>
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6 sm:text-base">
              Follow the 15-minute market and find the {targetShare == null ? 'highest-price' : `highest ${Math.round(targetShare)}%`} periods for your daily plan.
            </p>
          </div>
          {error && updatedAt != null ? (
            <Button type="button" variant="outline" className="min-h-11 self-start sm:self-auto" onClick={() => void refresh()}>
              <RefreshCw className="size-4" aria-hidden />
              Refresh settings
            </Button>
          ) : null}
        </div>

        {error && updatedAt == null ? (
          <div role="alert" className="flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">Could not load your saved daily settings.</p>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => void refresh()}>
              <RefreshCw className="size-4" aria-hidden />
              Try again
            </Button>
          </div>
        ) : null}

        <DailyPriceGraph />

        {loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3" aria-label="Loading saved controls">
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <StatusCard
              icon={Activity}
              label="Daily target"
              value={targetShare == null ? 'Not set' : `${Math.round(targetShare)}%`}
              detail="Highest-priced 15-minute periods to identify"
            />
            <StatusCard
              icon={Clock3}
              label="Market timezone"
              value={timezone}
              detail="Used to define the local market day"
            />
            <StatusCard
              icon={PlugZap}
              label="Home Assistant"
              value="Not connected"
              detail="Tapo switching is not active"
            />
          </div>
        )}
      </main>

      <FloatingAgentChat agentId={AGENT_ID} publicAgentId={PUBLIC_AGENT_ID} position="bottom-right" />
    </div>
  );
}
