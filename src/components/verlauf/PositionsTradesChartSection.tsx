"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Area,
  Legend,
  ComposedChart,
  Line,
  PieChart,
  Pie,
} from "recharts";

interface SnapshotPositionTrade {
  side: "B" | "S";
  trandattim?: string;
  instmnem: string;
  instshtnam: string;
  betrag: number;
  etpLabel: string;
}

interface SnapshotPosition {
  iban: string;
  tickerDisplay: string;
  nameDisplay: string;
  count: number;
  buyAmount: number;
  sellAmount: number;
  gesamt: number;
  etpLabel: string;
  trades?: SnapshotPositionTrade[];
}

interface Snapshot {
  id: string;
  snapshot_date: string;
  label: string | null;
  positions?: SnapshotPosition[] | null;
  created_at: string;
}

const CHART_COLORS = [
  "#f59e0b", "#22d3ee", "#a78bfa", "#34d399", "#f472b6", "#fb923c",
  "#60a5fa", "#4ade80", "#e879f9", "#f87171", "#a3e635", "#38bdf8",
];

function formatAmount(n: number) {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatAxisValue(v: number): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M.`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

function extractTimeFromTrandattim(raw: string | undefined): string {
  if (!raw || !String(raw).trim()) return "—";
  const s = String(raw).trim();
  const timeOnly = s.match(/^\d{1,2}:\d{2}(:\d{2})?/);
  if (timeOnly) return timeOnly[0];
  const inStr = s.match(/\d{1,2}:\d{2}(:\d{2})?/);
  if (inStr) return inStr[0];
  const compact = s.match(/(\d{2})(\d{2})(\d{2})?$/);
  if (compact) return compact[3] ? `${compact[1]}:${compact[2]}:${compact[3]}` : `${compact[1]}:${compact[2]}`;
  return "—";
}

/** Liefert Minuten seit Mitternacht (0–1439) für Intraday-Buckets */
function parseTimeToMinutes(raw: string | undefined): number | null {
  const timeStr = extractTimeFromTrandattim(raw);
  if (timeStr === "—") return null;
  const m = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const h = parseInt(m[1], 10) || 0;
  const min = parseInt(m[2], 10) || 0;
  const total = h * 60 + min;
  return Math.min(1439, Math.max(0, total));
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

const LINE_FILTER_OPTIONS: { value: "all" | "buy" | "sell" | "trades"; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "buy", label: "Buy" },
  { value: "sell", label: "Sell" },
  { value: "trades", label: "Trades" },
];

function LineFilterDropdown({
  value,
  onChange,
}: {
  value: "all" | "buy" | "sell" | "trades";
  onChange: (v: "all" | "buy" | "sell" | "trades") => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const current = LINE_FILTER_OPTIONS.find((o) => o.value === value)?.label ?? "Alle";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900/80 px-2.5 py-1.5 text-xs text-neutral-200 transition-all hover:border-neutral-600 hover:bg-neutral-800/80 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500/30 min-w-[88px] cursor-pointer"
      >
        <span className="flex-1 text-left">{current}</span>
        <svg
          className={`h-3 w-3 shrink-0 text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-full overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl shadow-black/20">
          {LINE_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                opt.value === value
                  ? "bg-amber-500/15 text-amber-400"
                  : "text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
              }`}
            >
              <span className="w-3 shrink-0 flex items-center justify-center">
                {opt.value === value && (
                  <svg className="h-3 w-3 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </span>
              <span className={opt.value === value ? "font-medium" : ""}>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomSelectDropdown({
  value,
  onChange,
  options,
  placeholder,
  minWidth = "88px",
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  minWidth?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const current = options.find((o) => o.value === value);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900/80 px-2.5 py-1.5 text-xs text-neutral-200 transition-all hover:border-neutral-600 hover:bg-neutral-800/80 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500/30 cursor-pointer shrink-0"
        style={{ minWidth }}
      >
        <span className="flex-1 text-left truncate">{current?.label ?? placeholder}</span>
        <svg
          className={`h-3 w-3 shrink-0 text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-full min-w-[140px] max-h-48 overflow-y-auto overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl shadow-black/20">
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer ${
              !value ? "bg-amber-500/15 text-amber-400" : "text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
            }`}
          >
            <span className="w-3 shrink-0 flex items-center justify-center">
              {!value && (
                <svg className="h-3 w-3 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </span>
            <span className={!value ? "font-medium" : ""}>— {placeholder} —</span>
          </button>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                opt.value === value
                  ? "bg-amber-500/15 text-amber-400"
                  : "text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
              }`}
            >
              <span className="w-3 shrink-0 flex items-center justify-center">
                {opt.value === value && (
                  <svg className="h-3 w-3 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </span>
              <span className={opt.value === value ? "font-medium" : ""}>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay() + 1);
  return start.toISOString().slice(0, 10);
}

function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

type PeriodGranularity = "day" | "week" | "month";
type ViewMode = "overview" | "compare" | "intraday";

interface PositionsTradesChartSectionProps {
  snapshots: Snapshot[];
  selectedSnapshot?: Snapshot | null;
}

export default function PositionsTradesChartSection({ snapshots, selectedSnapshot }: PositionsTradesChartSectionProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [granularity, setGranularity] = useState<PeriodGranularity>("day");
  const [periodA, setPeriodA] = useState<string>("");
  const [periodB, setPeriodB] = useState<string>("");

  useEffect(() => {
    setPeriodA("");
    setPeriodB("");
  }, [granularity]);
  const [intradayFilter, setIntradayFilter] = useState<string>("");
  const intradaySearchRef = useRef<HTMLInputElement>(null);
  const [intradayLineFilter, setIntradayLineFilter] = useState<"all" | "buy" | "sell" | "trades">("all");

  const getPeriodKey = (dateStr: string) => {
    switch (granularity) {
      case "day": return dateStr;
      case "week": return getWeekKey(dateStr);
      case "month": return getMonthKey(dateStr);
      default: return dateStr;
    }
  };

  const getPeriodLabel = (key: string) => {
    switch (granularity) {
      case "day":
        return formatDate(key);
      case "week":
        return `KW ${getWeekNumber(key)}`;
      case "month":
        return new Date(key + "-01").toLocaleDateString("de-DE", { month: "short", year: "2-digit" });
      default:
        return key;
    }
  };

  function getWeekNumber(dateStr: string): number {
    const d = new Date(dateStr);
    const start = new Date(d.getFullYear(), 0, 1);
    const days = Math.floor((d.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    return Math.ceil((days + start.getDay() + 1) / 7);
  }

  const toNum = (v: unknown): number => (typeof v === "number" && !Number.isNaN(v) ? v : Number(v) || 0);

  const aggregatedPeriods = useMemo(() => {
    const map = new Map<string, {
      periodKey: string;
      dateLabel: string;
      buyAmount: number;
      sellAmount: number;
      gesamt: number;
      tradeCount: number;
      positionCount: number;
      lastSnapshotDate: string;
    }>();

    for (const s of snapshots) {
      const key = getPeriodKey(s.snapshot_date);
      const existing = map.get(key);
      let buyAmount = 0;
      let sellAmount = 0;
      let gesamt = 0;
      let tradeCount = 0;
      const positions = s.positions ?? [];
      for (const p of positions) {
        buyAmount += toNum(p.buyAmount);
        sellAmount += toNum(p.sellAmount);
        gesamt += toNum(p.gesamt);
        tradeCount += (p.trades ?? []).length;
      }
      if (existing) {
        existing.buyAmount += buyAmount;
        existing.sellAmount += sellAmount;
        existing.tradeCount += tradeCount;
        existing.positionCount = Math.max(existing.positionCount, positions.length);
        if (s.snapshot_date > existing.lastSnapshotDate) {
          existing.gesamt = gesamt;
          existing.lastSnapshotDate = s.snapshot_date;
        }
      } else {
        map.set(key, {
          periodKey: key,
          dateLabel: getPeriodLabel(key),
          buyAmount,
          sellAmount,
          gesamt,
          tradeCount,
          positionCount: positions.length,
          lastSnapshotDate: s.snapshot_date,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.periodKey.localeCompare(b.periodKey));
  }, [snapshots, granularity]);

  const periodDropdownOptions = useMemo(() => {
    return aggregatedPeriods.map((p) => ({ value: p.periodKey, label: p.dateLabel }));
  }, [aggregatedPeriods]);

  const granularityLabel = granularity === "day" ? "Tag" : granularity === "week" ? "Woche" : "Monat";

  const positionOverviewData = useMemo(() => {
    const source = selectedSnapshot ?? snapshots[0];
    const positions = source?.positions;
    if (!positions || !Array.isArray(positions) || positions.length === 0) return [];
    return [...positions]
      .filter((p): p is SnapshotPosition => p != null && typeof p === "object")
      .map((p) => {
        const buy = toNum(p.buyAmount);
        const sell = toNum(p.sellAmount);
        const gesamt = typeof p.gesamt === "number" && !Number.isNaN(p.gesamt) ? p.gesamt : buy - sell;
        return { ...p, buyAmount: buy, sellAmount: sell, gesamt };
      })
      .sort((a, b) => Math.abs(b.gesamt) - Math.abs(a.gesamt))
      .slice(0, 12)
      .map((p, i) => ({
        name: (p.tickerDisplay || p.nameDisplay || p.iban || "?").toString().slice(0, 20),
        fullName: p.nameDisplay || p.iban,
        gesamt: p.gesamt,
        buyAmount: p.buyAmount,
        sellAmount: p.sellAmount,
        tradeCount: Array.isArray(p.trades) ? p.trades.length : (p.count ?? 0),
        fill: CHART_COLORS[i % CHART_COLORS.length],
      }));
  }, [snapshots, selectedSnapshot]);

  const tradeVolumeOverTime = useMemo(() => {
    return aggregatedPeriods.map((p) => ({
      ...p,
      label: p.dateLabel,
    }));
  }, [aggregatedPeriods]);

  const comparisonData = useMemo(() => {
    if (!periodA || !periodB) return [];
    const dataA = aggregatedPeriods.find((p) => p.periodKey === periodA);
    const dataB = aggregatedPeriods.find((p) => p.periodKey === periodB);
    if (!dataA || !dataB) return [];
    return [
      { name: "Buy", [getPeriodLabel(periodA)]: dataA.buyAmount, [getPeriodLabel(periodB)]: dataB.buyAmount },
      { name: "Sell", [getPeriodLabel(periodA)]: dataA.sellAmount, [getPeriodLabel(periodB)]: dataB.sellAmount },
      { name: "Gesamt", [getPeriodLabel(periodA)]: dataA.gesamt, [getPeriodLabel(periodB)]: dataB.gesamt },
      { name: "Trades", [getPeriodLabel(periodA)]: dataA.tradeCount, [getPeriodLabel(periodB)]: dataB.tradeCount },
    ];
  }, [periodA, periodB, aggregatedPeriods, granularity]);

  const totalTradesAcrossSnapshots = useMemo(() => {
    let total = 0;
    for (const s of snapshots) {
      for (const p of s.positions ?? []) {
        total += (p.trades ?? []).length || p.count || 0;
      }
    }
    return total;
  }, [snapshots]);

  const formatter = (value: number | undefined) => (value != null && Math.abs(value) >= 1000 ? formatAmount(value) : String(value ?? ""));

  const { intradayTrades, intradayBuckets } = useMemo(() => {
    const source = selectedSnapshot ?? snapshots[0];
    const positions = source?.positions ?? [];
    const trades: Array<{
      trandattim?: string;
      timeDisplay: string;
      minuteOfDay: number;
      side: "B" | "S";
      betrag: number;
      instmnem: string;
      instshtnam: string;
      etpLabel: string;
      positionName: string;
      iban: string;
    }> = [];
    for (const pos of positions) {
      const posName = (pos.tickerDisplay || pos.nameDisplay || pos.iban || "?").toString();
      const iban = (pos.iban ?? "").toString();
      for (const t of pos.trades ?? []) {
        const min = parseTimeToMinutes(t.trandattim);
        if (min != null) {
          trades.push({
            trandattim: t.trandattim,
            timeDisplay: extractTimeFromTrandattim(t.trandattim),
            minuteOfDay: min,
            side: t.side,
            betrag: toNum(t.betrag),
            instmnem: t.instmnem ?? "",
            instshtnam: t.instshtnam ?? "",
            etpLabel: t.etpLabel ?? "",
            positionName: posName,
            iban,
          });
        } else {
          trades.push({
            trandattim: t.trandattim,
            timeDisplay: extractTimeFromTrandattim(t.trandattim),
            minuteOfDay: 720,
            side: t.side,
            betrag: toNum(t.betrag),
            instmnem: t.instmnem ?? "",
            instshtnam: t.instshtnam ?? "",
            etpLabel: t.etpLabel ?? "",
            positionName: posName,
            iban,
          });
        }
      }
    }
    trades.sort((a, b) => a.minuteOfDay - b.minuteOfDay);
    const BUCKET_MIN = 15;
    const buckets: Array<{ timeLabel: string; bucketKey: number; buyAmount: number; sellAmount: number; count: number }> = [];
    for (let m = 7 * 60 + 30; m <= 23 * 60; m += BUCKET_MIN) {
      const h = Math.floor(m / 60);
      const min = m % 60;
      const label = `${h}:${String(min).padStart(2, "0")}`;
      const bucketTrades = trades.filter((t) => t.minuteOfDay >= m && t.minuteOfDay < m + BUCKET_MIN);
      let buyAmount = 0;
      let sellAmount = 0;
      for (const t of bucketTrades) {
        if (t.side === "B") buyAmount += t.betrag;
        else sellAmount += t.betrag;
      }
      buckets.push({
        timeLabel: label,
        bucketKey: m,
        buyAmount,
        sellAmount,
        count: bucketTrades.length,
      });
    }
    return { intradayTrades: trades, intradayBuckets: buckets };
  }, [snapshots, selectedSnapshot]);

  const { filteredIntradayTrades, filteredIntradayBuckets } = useMemo(() => {
    const q = intradayFilter.trim().toLowerCase();
    const filtered = !q
      ? intradayTrades
      : intradayTrades.filter(
          (t) =>
            (t.instmnem ?? "").toLowerCase().includes(q) ||
            (t.etpLabel ?? "").toLowerCase().includes(q) ||
            (t.positionName ?? "").toLowerCase().includes(q) ||
            (t.iban ?? "").toLowerCase().includes(q) ||
            (t.instshtnam ?? "").toLowerCase().includes(q)
        );
    const BUCKET_MIN = 15;
    const buckets: Array<{ timeLabel: string; bucketKey: number; buyAmount: number; sellAmount: number; count: number }> = [];
    for (let m = 7 * 60 + 30; m <= 23 * 60; m += BUCKET_MIN) {
      const h = Math.floor(m / 60);
      const min = m % 60;
      const label = `${h}:${String(min).padStart(2, "0")}`;
      const bucketTrades = filtered.filter((t) => t.minuteOfDay >= m && t.minuteOfDay < m + BUCKET_MIN);
      let buyAmount = 0;
      let sellAmount = 0;
      for (const t of bucketTrades) {
        if (t.side === "B") buyAmount += t.betrag;
        else sellAmount += t.betrag;
      }
      buckets.push({ timeLabel: label, bucketKey: m, buyAmount, sellAmount, count: bucketTrades.length });
    }
    return { filteredIntradayTrades: filtered, filteredIntradayBuckets: buckets };
  }, [intradayTrades, intradayFilter]);

  const pieData = useMemo(() => {
    if (positionOverviewData.length === 0) return [];
    return positionOverviewData.map((p) => ({
      name: p.name,
      value: Math.abs(p.gesamt),
      fill: p.fill,
      buyAmount: p.buyAmount,
      sellAmount: p.sellAmount,
      gesamt: p.gesamt,
    }));
  }, [positionOverviewData]);

  const hasPositionData = snapshots.some((s) => s.positions && s.positions.length > 0);

  if (!hasPositionData) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-8 text-center">
        <p className="text-neutral-500 text-sm">
          Keine Positions- und Trade-Daten vorhanden. Speichern Sie Snapshots mit Positionen aus der Auswertung.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 overflow-hidden mb-8">
      <div className="px-5 py-4 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-neutral-100 tracking-tight shrink-0">
          Positions- & Trades-Analyse
        </h2>
        <div className="flex items-center gap-4 flex-wrap flex-1 min-w-0 justify-end">
          {viewMode === "compare" && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex rounded-lg border border-neutral-700 overflow-hidden text-xs">
                {(["day", "week", "month"] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGranularity(g)}
                    className={`px-3 py-1.5 transition-colors cursor-pointer ${
                      granularity === g ? "bg-neutral-700 text-neutral-200" : "text-neutral-500 hover:bg-neutral-800"
                    }`}
                  >
                    {g === "day" ? "Tag" : g === "week" ? "Woche" : "Monat"}
                  </button>
                ))}
              </div>
              <span className="text-neutral-500 text-xs shrink-0">{granularityLabel} vs {granularityLabel}:</span>
              <CustomSelectDropdown
                value={periodA}
                onChange={setPeriodA}
                options={periodDropdownOptions}
                placeholder={`Periode A (${granularityLabel})`}
                minWidth="120px"
              />
              <span className="text-neutral-500 text-xs">vs</span>
              <CustomSelectDropdown
                value={periodB}
                onChange={setPeriodB}
                options={periodDropdownOptions}
                placeholder={`Periode B (${granularityLabel})`}
                minWidth="120px"
              />
            </div>
          )}
          <div className="flex rounded-lg border border-neutral-700 overflow-hidden text-xs shrink-0">
            <button
              type="button"
              onClick={() => setViewMode("overview")}
              className={`px-4 py-2 transition-colors cursor-pointer ${
                viewMode === "overview" ? "bg-amber-500/20 text-amber-400" : "text-neutral-400 hover:bg-neutral-800"
              }`}
            >
              Übersicht
            </button>
            <button
              type="button"
              onClick={() => setViewMode("intraday")}
              className={`px-4 py-2 transition-colors cursor-pointer ${
                viewMode === "intraday" ? "bg-amber-500/20 text-amber-400" : "text-neutral-400 hover:bg-neutral-800"
              }`}
            >
              Intraday
            </button>
            <button
              type="button"
              onClick={() => setViewMode("compare")}
              className={`px-4 py-2 transition-colors cursor-pointer ${
                viewMode === "compare" ? "bg-amber-500/20 text-amber-400" : "text-neutral-400 hover:bg-neutral-800"
              }`}
            >
              Vergleich
            </button>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-6">
        {viewMode === "overview" && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm text-neutral-400 mb-3">Größte Positionen (Top 12)</h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={positionOverviewData} layout="vertical" margin={{ left: 60, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#404040" />
                      <XAxis type="number" stroke="#737373" tickFormatter={(v) => formatAxisValue(v)} />
                      <YAxis type="category" dataKey="name" width={60} stroke="#737373" tick={{ fontSize: 11 }} />
                      <Tooltip
                        cursor={{ fill: "rgba(251,191,36,0.08)" }}
                        contentStyle={{ backgroundColor: "#262626", border: "1px solid #404040", borderRadius: "8px" }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.[0]) return null;
                          const p = payload[0].payload;
                          return (
                            <div className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 shadow-xl">
                              <p className="text-sm font-medium text-neutral-200 mb-1.5">{p.name}</p>
                              <p className="text-xs text-emerald-400 tabular-nums">Buy: {formatAmount(p.buyAmount ?? 0)}</p>
                              <p className="text-xs text-red-400 tabular-nums">Sell: {formatAmount(p.sellAmount ?? 0)}</p>
                              <p className="text-xs text-amber-400 tabular-nums mt-0.5">Gesamt: {formatAmount(p.gesamt ?? 0)}</p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="gesamt" radius={[0, 4, 4, 0]}>
                        {positionOverviewData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div>
                <h3 className="text-sm text-neutral-400 mb-3">Verteilung nach Wert</h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="name"
                        label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} stroke="#171717" strokeWidth={1} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: "#262626", border: "1px solid #404040", borderRadius: "8px" }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.[0]) return null;
                          const p = payload[0].payload;
                          return (
                            <div className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 shadow-xl">
                              <p className="text-sm font-medium text-neutral-200 mb-1.5">{p.name}</p>
                              <p className="text-xs text-emerald-400 tabular-nums">Buy: {formatAmount(p.buyAmount ?? 0)}</p>
                              <p className="text-xs text-red-400 tabular-nums">Sell: {formatAmount(p.sellAmount ?? 0)}</p>
                              <p className="text-xs text-amber-400 tabular-nums mt-0.5">Gesamt: {formatAmount(p.gesamt ?? 0)}</p>
                            </div>
                          );
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm text-neutral-400 mb-3">Trade-Volumen über Zeit (Buy vs Sell)</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={tradeVolumeOverTime} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradBuy" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradSell" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f87171" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#f87171" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#404040" vertical={false} />
                    <XAxis dataKey="label" stroke="#737373" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" stroke="#737373" tick={{ fontSize: 11 }} tickFormatter={(v) => formatAxisValue(v)} />
                    <YAxis yAxisId="right" orientation="right" stroke="#737373" tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#262626", border: "1px solid #404040", borderRadius: "8px" }}
                      formatter={formatter}
                    />
                    <Legend />
                    <Area yAxisId="left" type="monotone" dataKey="buyAmount" name="Buy" fill="url(#gradBuy)" stroke="none" />
                    <Area yAxisId="left" type="monotone" dataKey="sellAmount" name="Sell" fill="url(#gradSell)" stroke="none" />
                    <Line yAxisId="left" type="monotone" dataKey="buyAmount" stroke="#34d399" strokeWidth={2} dot={false} legendType="none" />
                    <Line yAxisId="left" type="monotone" dataKey="sellAmount" stroke="#f87171" strokeWidth={2} dot={false} legendType="none" />
                    <Line yAxisId="right" type="monotone" dataKey="tradeCount" name="Anzahl Trades" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/80 p-4">
                <p className="text-xs text-neutral-500 uppercase tracking-wider">Gesamt-Positionen</p>
                <p className="text-xl font-semibold text-neutral-100 tabular-nums mt-0.5">
                  {positionOverviewData.reduce((acc, p) => acc + 1, 0)}
                </p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/80 p-4">
                <p className="text-xs text-neutral-500 uppercase tracking-wider">Trades gesamt</p>
                <p className="text-xl font-semibold text-amber-400 tabular-nums mt-0.5">{totalTradesAcrossSnapshots}</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/80 p-4">
                <p className="text-xs text-neutral-500 uppercase tracking-wider">Gesamt-Wert</p>
                <p className="text-xl font-semibold text-emerald-400 tabular-nums mt-0.5">
                  {formatAmount(positionOverviewData.reduce((a, p) => a + p.gesamt, 0))}
                </p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/80 p-4">
                <p className="text-xs text-neutral-500 uppercase tracking-wider">Zeiträume</p>
                <p className="text-xl font-semibold text-neutral-300 tabular-nums mt-0.5">
                  {aggregatedPeriods.length}
                </p>
              </div>
            </div>
          </>
        )}

        {viewMode === "intraday" && (
          <>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm text-neutral-400">Trades nach Uhrzeit (15-Min-Intervalle){intradayFilter ? ` – ${filteredIntradayTrades.length} Treffer` : ""}</h3>
                  <LineFilterDropdown value={intradayLineFilter} onChange={setIntradayLineFilter} />
                </div>
                <div className="relative">
                  <input
                    ref={intradaySearchRef}
                    type="text"
                    defaultValue={intradayFilter}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const v = intradaySearchRef.current?.value?.trim() ?? "";
                        setIntradayFilter(v);
                      } else if (e.key === "Escape") {
                        if (intradaySearchRef.current) intradaySearchRef.current.value = "";
                        intradaySearchRef.current?.blur();
                      }
                    }}
                    placeholder="Kürzel oder ISIN filtern… (Enter)"
                    className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 pr-8 text-sm text-neutral-200 placeholder-neutral-500 focus:border-amber-500 focus:outline-none w-48"
                  />
                  {intradayFilter && (
                    <button
                      type="button"
                      onClick={() => {
                        setIntradayFilter("");
                        if (intradaySearchRef.current) intradaySearchRef.current.value = "";
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 rounded text-neutral-500 hover:bg-neutral-700 hover:text-neutral-200 cursor-pointer transition-colors"
                      aria-label="Filter zurücksetzen"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={filteredIntradayBuckets} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                    <defs>
                      <linearGradient id="gradBuyIntra" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradSellIntra" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f87171" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#f87171" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#404040" vertical={false} />
                    <XAxis dataKey="timeLabel" stroke="#737373" tick={{ fontSize: 11 }} interval={1} />
                    <YAxis yAxisId="left" stroke="#737373" tick={{ fontSize: 11 }} tickFormatter={(v) => formatAxisValue(v)} />
                    <YAxis yAxisId="right" orientation="right" stroke="#737373" tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#262626", border: "1px solid #404040", borderRadius: "8px" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.[0]) return null;
                        const p = payload[0].payload;
                        return (
                          <div className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 shadow-xl">
                            <p className="text-sm font-medium text-neutral-200 mb-1.5">{p.timeLabel}</p>
                            <p className="text-xs text-emerald-400 tabular-nums">Buy: {formatAmount(p.buyAmount)}</p>
                            <p className="text-xs text-red-400 tabular-nums">Sell: {formatAmount(p.sellAmount)}</p>
                            <p className="text-xs text-amber-400 tabular-nums">Trades: {p.count}</p>
                          </div>
                        );
                      }}
                    />
                    {(intradayLineFilter === "all" || intradayLineFilter === "buy") && (
                      <Line yAxisId="left" type="monotone" dataKey="buyAmount" name="Buy" stroke="#34d399" strokeWidth={2} dot={false} />
                    )}
                    {(intradayLineFilter === "all" || intradayLineFilter === "sell") && (
                      <Line yAxisId="left" type="monotone" dataKey="sellAmount" name="Sell" stroke="#f87171" strokeWidth={2} dot={false} />
                    )}
                    {(intradayLineFilter === "all" || intradayLineFilter === "trades") && (
                      <Line yAxisId="right" type="monotone" dataKey="count" name="Anzahl" stroke="#f59e0b" strokeWidth={2} dot={false} />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <h3 className="text-sm text-neutral-400 mb-3">Alle Trades mit Uhrzeit ({filteredIntradayTrades.length})</h3>
              <div className="overflow-x-auto max-h-80 overflow-y-auto rounded-lg border border-neutral-800">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-neutral-900 z-10">
                    <tr className="text-left text-neutral-500 border-b border-neutral-800">
                      <th className="px-4 py-2 font-normal">Uhrzeit</th>
                      <th className="px-4 py-2 font-normal w-16">B/S</th>
                      <th className="px-4 py-2 font-normal">Kürzel</th>
                      <th className="px-4 py-2 font-normal">Name</th>
                      <th className="px-4 py-2 font-normal text-right">Betrag</th>
                      <th className="px-4 py-2 font-normal text-center w-20">Crypto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIntradayTrades.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                          {intradayFilter
                            ? `Keine Trades passen zu „${intradayFilter}“.`
                            : "Keine Trades mit Uhrzeit im Snapshot. Die CSV muss eine TRANDATTIM-Spalte enthalten."}
                        </td>
                      </tr>
                    ) : (
                      filteredIntradayTrades.map((t, idx) => (
                        <tr key={idx} className="border-b border-neutral-800/50 hover:bg-neutral-800/20">
                          <td className="px-4 py-2 font-mono text-neutral-300 tabular-nums">{t.timeDisplay}</td>
                          <td className="px-4 py-2">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs ${t.side === "B" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                              {t.side === "B" ? "Buy" : "Sell"}
                            </span>
                          </td>
                          <td className="px-4 py-2 font-mono text-neutral-400">{t.instmnem || "—"}</td>
                          <td className="px-4 py-2 text-neutral-300 truncate max-w-[180px]" title={t.instshtnam}>{t.instshtnam || "—"}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-neutral-200">{formatAmount(t.betrag)}</td>
                          <td className="px-4 py-2 text-center">
                            {t.etpLabel ? <span className="text-xs text-amber-400">{t.etpLabel}</span> : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {viewMode === "compare" && (
          <>
            {!periodA || !periodB ? (
              <p className="py-8 text-center text-neutral-500 text-sm">
                Wählen Sie Perioden A und B aus, um sie zu vergleichen.
              </p>
            ) : (
              <>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={comparisonData}
                      margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                      layout="vertical"
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#404040" />
                      <XAxis type="number" stroke="#737373" tickFormatter={(v) => formatAxisValue(v)} />
                      <YAxis type="category" dataKey="name" width={80} stroke="#737373" tick={{ fontSize: 11 }} />
                      <Tooltip
                        cursor={{ fill: "rgba(251,191,36,0.08)" }}
                        contentStyle={{ backgroundColor: "#262626", border: "1px solid #404040", borderRadius: "8px" }}
                        formatter={formatter}
                      />
                      <Legend />
                      <Bar dataKey={getPeriodLabel(periodA)} fill="#f59e0b" radius={[0, 4, 4, 0]} name={getPeriodLabel(periodA)} />
                      <Bar dataKey={getPeriodLabel(periodB)} fill="#22d3ee" radius={[0, 4, 4, 0]} name={getPeriodLabel(periodB)} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-neutral-500 border-b border-neutral-800">
                        <th className="pb-2 text-left font-normal">Metrik</th>
                        <th className="pb-2 text-right font-normal">{getPeriodLabel(periodA)}</th>
                        <th className="pb-2 text-right font-normal">{getPeriodLabel(periodB)}</th>
                        <th className="pb-2 text-right font-normal">Diff.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonData.map((row) => {
                        const valA = row[getPeriodLabel(periodA)] as number;
                        const valB = row[getPeriodLabel(periodB)] as number;
                        const diff = typeof valA === "number" && typeof valB === "number" ? valB - valA : 0;
                        return (
                          <tr key={row.name} className="border-b border-neutral-800/50">
                            <td className="py-2 text-neutral-300">{row.name}</td>
                            <td className="py-2 text-right tabular-nums text-neutral-300">
                              {typeof valA === "number" && Math.abs(valA) >= 100 ? formatAmount(valA) : valA}
                            </td>
                            <td className="py-2 text-right tabular-nums text-neutral-300">
                              {typeof valB === "number" && Math.abs(valB) >= 100 ? formatAmount(valB) : valB}
                            </td>
                            <td className={`py-2 text-right tabular-nums ${diff >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {typeof diff === "number" && Math.abs(diff) >= 100 ? formatAmount(diff) : diff}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
