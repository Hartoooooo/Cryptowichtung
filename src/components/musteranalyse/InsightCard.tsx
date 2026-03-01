"use client";

import type { Insight } from "@/lib/pattern-engine/types";

interface InsightCardProps {
  insight: Insight;
  onClick: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  TRADE_COUNT_SPIKE: "Trade-Spike",
  NOTIONAL_SPIKE: "Notional-Spike",
  BURSTINESS: "Burst",
  QUIET_PERIOD: "Ruhe",
  OPEN_CLOSE_CONCENTRATION: "Open/Close",
  LUNCHTIME_ANOMALY: "Mittags",
  SYMBOL_DOMINANCE_SHIFT: "Symbol-Wechsel",
  NOTIONAL_CONCENTRATION: "Konzentration",
  FLIP_FLOP: "Flip-Flop",
  CLONE_TRADES: "Clone",
  FEE_CHURN: "Fee Churn",
  DUPLICATE_REPLAY: "Duplikat",
  LOSS_STREAK: "Verlustserie",
  POST_LOSS_ESCALATION: "Eskalation",
  SKEW_PATTERN: "Skew",
  TIMESTAMP_ISSUES: "Timestamp",
  MISSING_CORE_FIELDS: "Datenqualität",
};

export default function InsightCard({ insight, onClick }: InsightCardProps) {
  const label = TYPE_LABELS[insight.type] ?? insight.type;
  const severityColor =
    insight.severity >= 70 ? "bg-red-500/20 text-red-400" :
    insight.severity >= 40 ? "bg-amber-500/20 text-amber-400" :
    "bg-neutral-600/30 text-neutral-400";

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-xl border border-neutral-700 bg-neutral-800/50 px-4 py-3 hover:border-amber-500/50 hover:bg-neutral-800 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${severityColor} mb-1`}>
            {label}
          </span>
          <p className="text-sm text-neutral-200 font-medium truncate">{insight.title}</p>
          <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">{insight.explanation}</p>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <span className="text-xs text-neutral-500">
            Severity: <span className="font-mono text-neutral-300">{insight.severity}</span>
          </span>
          <span className="text-xs text-neutral-500">
            Confidence: <span className="font-mono text-neutral-300">{(insight.confidence * 100).toFixed(0)}%</span>
          </span>
          {insight.affectedTradeIds.length > 0 && (
            <span className="text-xs text-amber-400 mt-1">
              {insight.affectedTradeIds.length} Trades →
            </span>
          )}
        </div>
      </div>
      <div className="mt-2 h-1 rounded-full bg-neutral-700 overflow-hidden">
        <div
          className="h-full rounded-full bg-amber-500 transition-all"
          style={{ width: `${insight.severity}%` }}
        />
      </div>
    </button>
  );
}
