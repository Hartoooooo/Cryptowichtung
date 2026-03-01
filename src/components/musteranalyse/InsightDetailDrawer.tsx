"use client";

import { useEffect } from "react";
import type { Insight, NormalizedTrade } from "@/lib/pattern-engine/types";

interface InsightDetailDrawerProps {
  insight: Insight | null;
  trades: NormalizedTrade[];
  onClose: () => void;
  onExport: (ids: string[]) => void;
}

export default function InsightDetailDrawer({
  insight,
  trades,
  onClose,
  onExport,
}: InsightDetailDrawerProps) {
  useEffect(() => {
    if (!insight) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [insight, onClose]);

  if (!insight) return null;

  const affectedTrades = insight.affectedTradeIds.length > 0
    ? trades.filter((t) => insight.affectedTradeIds.includes(t.id))
    : [];

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        role="button"
        tabIndex={0}
        aria-label="Schließen"
      />
      <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-neutral-900 border-l border-neutral-800 shadow-xl z-50 flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
        <h3 className="text-lg font-medium text-neutral-100">{insight.title}</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <div>
          <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">Erklärung</h4>
          <p className="text-sm text-neutral-300">{insight.explanation}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-neutral-800/50 px-3 py-2">
            <span className="text-xs text-neutral-500">Severity</span>
            <p className="font-mono text-amber-400">{insight.severity}</p>
          </div>
          <div className="rounded-lg bg-neutral-800/50 px-3 py-2">
            <span className="text-xs text-neutral-500">Confidence</span>
            <p className="font-mono text-neutral-300">{(insight.confidence * 100).toFixed(0)}%</p>
          </div>
        </div>

        {Object.keys(insight.metrics).length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">Metriken</h4>
            <div className="rounded-lg bg-neutral-800/30 p-3 text-sm font-mono text-neutral-400">
              {Object.entries(insight.metrics).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <span>{k}</span>
                  <span>{typeof v === "number" ? (v >= 1000 ? v.toLocaleString("de-DE") : v) : String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {insight.params && Object.keys(insight.params).length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-neutral-500 uppercase mb-1">Regeln/Schwellen</h4>
            <div className="rounded-lg bg-neutral-800/30 p-3 text-sm font-mono text-neutral-400">
              {Object.entries(insight.params).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <span>{k}</span>
                  <span>{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          {typeof insight.metrics.symbol === "string" && typeof insight.metrics.timeRange === "string" ? (
            <div className="mb-3 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-sm">
              <span className="text-amber-400 font-medium">
                {affectedTrades.length} Trades um {insight.metrics.timeRange} bei {insight.metrics.symbol}
              </span>
            </div>
          ) : null}
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-medium text-neutral-500 uppercase">
              Betroffene Trades ({affectedTrades.length})
            </h4>
            {affectedTrades.length > 0 && (
              <button
                type="button"
                onClick={() => onExport(insight.affectedTradeIds)}
                className="rounded-lg bg-amber-500 px-2 py-1 text-xs text-neutral-950 font-medium hover:bg-amber-400"
              >
                CSV Export
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-neutral-700">
            {affectedTrades.length === 0 ? (
              <p className="p-3 text-sm text-neutral-500">Keine konkreten Trades zugeordnet.</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-neutral-800">
                  <tr className="text-left text-neutral-500">
                    <th className="px-3 py-2">Symbol</th>
                    <th className="px-3 py-2">Side</th>
                    <th className="px-3 py-2 text-right">Notional</th>
                    <th className="px-3 py-2">Zeit</th>
                  </tr>
                </thead>
                <tbody>
                  {affectedTrades.slice(0, 100).map((t) => (
                    <tr key={t.id} className="border-t border-neutral-700/50">
                      <td className="px-3 py-1.5 font-mono text-neutral-300">{t.symbol}</td>
                      <td className="px-3 py-1.5">
                        <span className={t.side === "BUY" ? "text-emerald-400" : "text-red-400"}>
                          {t.side}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-neutral-300">
                        {t.notional.toLocaleString("de-DE")}
                      </td>
                      <td className="px-3 py-1.5 text-neutral-500">
                        {t.timestamp ? new Date(t.timestamp).toLocaleTimeString("de-DE") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {affectedTrades.length > 100 && (
              <p className="px-3 py-2 text-xs text-neutral-500 border-t border-neutral-700">
                … und {affectedTrades.length - 100} weitere
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
