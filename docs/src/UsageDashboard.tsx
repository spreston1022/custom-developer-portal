import { Fragment, useMemo, useState } from "react";
import { Head } from "zudoku/components";
import { useQuery } from "zudoku/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "zudoku/ui/Card";
import { NativeSelect, NativeSelectOption } from "zudoku/ui/NativeSelect";

/**
 * Usage dashboard for product and customer success teams.
 *
 * Charts any monetization meter (credits, API requests, ...) per consumer and
 * shows request analytics for a selected consumer. Data comes from the
 * `/portal-api/usage/*` routes on this project's gateway
 * (see modules/usage-api.ts), which call the Zuplo Developer API server-side.
 */

// The gateway deployed with this portal. Zuplo sets ZUPLO_SERVER_URL at build
// time; locally `zuplo dev` serves the gateway on port 9000.
const GATEWAY_URL: string =
  import.meta.env.ZUPLO_SERVER_URL ?? "http://localhost:9000";

type Meter = { slug: string; name: string; description?: string };

type MeterRow = {
  value: number;
  windowStart: string;
  windowEnd: string;
  subject: string;
  customerId?: string;
};

type StatusStats = {
  data: {
    stats?: Array<{
      consumer: string;
      totalCalls: number;
      // Map of status code to call count, e.g. { "200": 11, "429": 2 }
      callsByStatusCode: Record<string, number>;
    }>;
  };
};

const RANGES = [
  { label: "Last 7 days", days: 7, analyticsWindow: "last-7-days" },
  { label: "Last 30 days", days: 30, analyticsWindow: "last-30-days" },
  { label: "Last 90 days", days: 90, analyticsWindow: "last-3-months" },
] as const;

const numberFormat = new Intl.NumberFormat();

async function gatewayFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${GATEWAY_URL}${path}`);
  if (!response.ok) {
    const problem = await response.json().catch(() => null);
    throw new Error(problem?.detail ?? `Request failed (${response.status})`);
  }
  return response.json();
}

export const UsageDashboard = () => {
  const [meterSlug, setMeterSlug] = useState<string>();
  const [rangeIndex, setRangeIndex] = useState(1);
  const [selectedConsumer, setSelectedConsumer] = useState<string>();
  const range = RANGES[rangeIndex]!;

  const meters = useQuery({
    queryKey: ["usage-meters"],
    queryFn: () => gatewayFetch<Meter[]>("/portal-api/usage/meters"),
  });

  // Default to a "credits" meter if there is one, otherwise the first meter.
  const activeMeter =
    meters.data?.find((m) => m.slug === meterSlug) ??
    meters.data?.find((m) => m.slug === "credits") ??
    meters.data?.[0];

  const usage = useQuery({
    queryKey: ["usage", activeMeter?.slug, range.days],
    queryFn: () => {
      const params = new URLSearchParams({
        from: new Date(Date.now() - range.days * 86_400_000).toISOString(),
        to: new Date().toISOString(),
        windowSize: "DAY",
      });
      return gatewayFetch<{ data: MeterRow[] }>(
        `/portal-api/usage/meters/${activeMeter!.slug}?${params}`,
      );
    },
    enabled: Boolean(activeMeter),
  });

  const requestStats = useQuery({
    queryKey: ["usage-requests", selectedConsumer, range.analyticsWindow],
    queryFn: () =>
      gatewayFetch<StatusStats>(
        `/portal-api/usage/requests?${new URLSearchParams({
          consumers: selectedConsumer!,
          window: range.analyticsWindow,
        })}`,
      ),
    enabled: Boolean(selectedConsumer),
  });

  const { byConsumer, byDay, total, filteredTotal } = useMemo(() => {
    const rows = usage.data?.data ?? [];
    const consumerTotals = new Map<string, number>();
    const dayTotals = new Map<string, number>();
    let total = 0;
    let filteredTotal = 0;

    for (const row of rows) {
      const consumer = row.subject || "(unattributed)";
      consumerTotals.set(consumer, (consumerTotals.get(consumer) ?? 0) + row.value);
      if (!selectedConsumer || consumer === selectedConsumer) {
        const day = row.windowStart.slice(0, 10);
        dayTotals.set(day, (dayTotals.get(day) ?? 0) + row.value);
        filteredTotal += row.value;
      }
      total += row.value;
    }

    // One slot per day in the range (UTC), so empty days show as gaps.
    const byDay: Array<[string, number]> = [];
    const today = new Date();
    for (let i = range.days - 1; i >= 0; i--) {
      const day = new Date(today.getTime() - i * 86_400_000).toISOString().slice(0, 10);
      byDay.push([day, dayTotals.get(day) ?? 0]);
    }

    return {
      total,
      filteredTotal,
      byConsumer: [...consumerTotals.entries()].sort((a, b) => b[1] - a[1]),
      byDay,
    };
  }, [usage.data, selectedConsumer, range.days]);

  const error = meters.error ?? usage.error;
  const maxDay = niceMax(Math.max(0, ...byDay.map(([, v]) => v)));
  const meterName = activeMeter?.name ?? "Usage";

  return (
    <section className="py-8 flex flex-col gap-6">
      <Head>
        <title>API usage</title>
      </Head>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">API usage</h1>
          <p className="text-muted-foreground">
            Metered usage per consumer, from Zuplo monetization.
          </p>
        </div>
        <div className="flex gap-2">
          <NativeSelect
            aria-label="Meter"
            value={activeMeter?.slug ?? ""}
            onChange={(e) => setMeterSlug(e.target.value)}
          >
            {meters.data?.map((m) => (
              <NativeSelectOption key={m.slug} value={m.slug}>
                {m.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="Date range"
            value={rangeIndex}
            onChange={(e) => setRangeIndex(Number(e.target.value))}
          >
            {RANGES.map((r, i) => (
              <NativeSelectOption key={r.label} value={i}>
                {r.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="Consumer"
            className="max-w-56"
            value={selectedConsumer ?? ""}
            onChange={(e) => setSelectedConsumer(e.target.value || undefined)}
          >
            <NativeSelectOption value="">All consumers</NativeSelectOption>
            {byConsumer.map(([consumer]) => (
              <NativeSelectOption key={consumer} value={consumer}>
                {consumer}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </header>

      {error && (
        <div className="rounded-md border border-destructive p-4 text-destructive">
          {error.message}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label={selectedConsumer ? `${meterName} · selected consumer` : `Total ${meterName}`}
          value={numberFormat.format(filteredTotal)}
          detail={
            selectedConsumer
              ? `${Math.round((filteredTotal / Math.max(total, 1)) * 100)}% of ${numberFormat.format(total)} total`
              : undefined
          }
        />
        <Stat label="Active consumers" value={String(byConsumer.length)} />
        <Stat
          label="Top consumer"
          value={byConsumer[0]?.[0] ?? "—"}
          detail={
            byConsumer[0] ? `${numberFormat.format(byConsumer[0][1])} ${meterName}` : undefined
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {meterName} per day
            {selectedConsumer && (
              <span className="font-normal text-muted-foreground">
                {" "}
                · {selectedConsumer}{" "}
                <button
                  type="button"
                  className="text-xs underline underline-offset-2"
                  onClick={() => setSelectedConsumer(undefined)}
                >
                  Show all
                </button>
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {usage.isLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : filteredTotal === 0 ? (
            <p className="text-muted-foreground">No usage in this period.</p>
          ) : (
            <DailyChart days={byDay} max={maxDay} unit={meterName} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By consumer</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">Consumer</th>
                <th className="py-2 font-medium text-right">{meterName}</th>
                <th className="py-2 font-medium w-1/3">Share</th>
              </tr>
            </thead>
            <tbody>
              {byConsumer.map(([consumer, value]) => (
                <tr
                  key={consumer}
                  className={`cursor-pointer border-t hover:bg-muted ${
                    consumer === selectedConsumer ? "bg-muted" : ""
                  }`}
                  onClick={() =>
                    setSelectedConsumer(consumer === selectedConsumer ? undefined : consumer)
                  }
                >
                  <td className="py-2">{consumer}</td>
                  <td className="py-2 text-right tabular-nums">
                    {numberFormat.format(value)}
                  </td>
                  <td className="py-2 pl-4">
                    <div className="h-2 rounded bg-muted">
                      <div
                        className="h-2 rounded bg-primary"
                        style={{ width: `${(value / Math.max(total, 1)) * 100}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted-foreground">
            Select a consumer here or in the filter above to see their usage and request status codes.
          </p>
        </CardContent>
      </Card>

      {selectedConsumer && (
        <Card>
          <CardHeader>
            <CardTitle>Requests by status code · {selectedConsumer}</CardTitle>
          </CardHeader>
          <CardContent>
            {requestStats.isLoading ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : requestStats.error ? (
              <p className="text-destructive">{requestStats.error.message}</p>
            ) : (
              <div className="flex flex-wrap gap-6">
                {requestStats.data?.data.stats?.map((s) => (
                  <Fragment key={s.consumer}>
                    <StatusCount label="Total" count={s.totalCalls} />
                    {Object.entries(s.callsByStatusCode).map(([code, count]) => (
                      <StatusCount key={code} label={code} count={count} />
                    ))}
                  </Fragment>
                )) ?? <p className="text-muted-foreground">No requests.</p>}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </section>
  );
};

const Stat = ({ label, value, detail }: { label: string; value: string; detail?: string }) => (
  <Card>
    <CardContent className="pt-6">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold truncate">{value}</div>
      {detail && <div className="text-xs text-muted-foreground">{detail}</div>}
    </CardContent>
  </Card>
);

const StatusCount = ({ label, count }: { label: string; count: number }) => (
  <div>
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="text-xl font-semibold tabular-nums">{numberFormat.format(count)}</div>
  </div>
);

const dayFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const formatDay = (day: string) => dayFormat.format(new Date(`${day}T00:00:00Z`));

// Rounds the axis maximum up to 1, 2 or 5 × a power of ten.
function niceMax(value: number) {
  if (value <= 1) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((m) => m * power >= value)!;
  return step * power;
}

const DailyChart = ({
  days,
  max,
  unit,
}: {
  days: Array<[string, number]>;
  max: number;
  unit: string;
}) => {
  const ticks = [max, max / 2, 0];
  const labelIndexes = new Set([0, Math.floor((days.length - 1) / 2), days.length - 1]);

  return (
    <div className="flex gap-2" role="img" aria-label={`${unit} per day`}>
      <div className="flex h-48 flex-col justify-between text-right text-xs text-muted-foreground tabular-nums">
        {ticks.map((t) => (
          <span key={t} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
            {numberFormat.format(t)}
          </span>
        ))}
      </div>
      <div className="flex-1">
        <div className="relative h-48 border-b border-l border-border">
          <div className="absolute inset-x-0 top-0 border-t border-dashed border-border" />
          <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border" />
          <div className="absolute inset-0 flex items-end gap-px px-px">
            {days.map(([day, value]) => (
              <div key={day} className="group relative flex h-full flex-1 items-end justify-center">
                {value > 0 && (
                  <div
                    className="w-full max-w-6 rounded-t-sm bg-primary/70 group-hover:bg-primary"
                    style={{ height: `${(value / max) * 100}%`, minHeight: 2 }}
                  />
                )}
                <div className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded border bg-popover px-2 py-1 text-xs text-popover-foreground shadow group-hover:block">
                  {formatDay(day)}: {numberFormat.format(value)} {unit}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-1 flex text-xs text-muted-foreground">
          {days.map(([day], i) => (
            <div key={day} className="flex-1 text-center">
              {labelIndexes.has(i) ? <span className="whitespace-nowrap">{formatDay(day)}</span> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
