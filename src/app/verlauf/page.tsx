"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";

interface SnapshotCoin {
  name: string;
  buyAmount: number;
  sellAmount: number;
  totalAmount: number;
  pct: number;
}

interface Snapshot {
  id: string;
  snapshot_date: string;
  label: string | null;
  coins: SnapshotCoin[];
  created_at: string;
}

const COLORS = [
  "#f59e0b","#22d3ee","#a78bfa","#34d399",
  "#f472b6","#fb923c","#60a5fa","#4ade80",
  "#e879f9","#f87171","#a3e635","#38bdf8",
];

function formatAmount(n: number) {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

export default function VerlaufPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCoin, setSelectedCoin] = useState<string | null>(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState<Snapshot | null>(null);
  const [chartMetric, setChartMetric] = useState<"pct" | "totalAmount" | "buyAmount" | "sellAmount">("pct");

  useEffect(() => {
    fetch("/api/snapshots")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return; }
        const list: Snapshot[] = Array.isArray(data) ? data : [];
        setSnapshots(list);
        if (list.length > 0) setSelectedSnapshot(list[0]);
      })
      .catch(() => setError("Fehler beim Laden"))
      .finally(() => setLoading(false));
  }, []);

  // Alle einzigartigen Coins über alle Snapshots
  const allCoins = useMemo(() => {
    const set = new Set<string>();
    snapshots.forEach((s) => s.coins.forEach((c) => set.add(c.name)));
    return Array.from(set).sort();
  }, [snapshots]);

  // Verlaufs-Daten für einen bestimmten Coin (älteste zuerst für Chart)
  const coinHistory = useMemo(() => {
    if (!selectedCoin) return [];
    return [...snapshots]
      .reverse()
      .map((s) => ({
        snapshot: s,
        coin: s.coins.find((c) => c.name === selectedCoin) ?? null,
      }))
      .filter((e) => e.coin !== null);
  }, [selectedCoin, snapshots]);

  // Max-Wert für Skalierung
  const chartMax = useMemo(() => {
    if (coinHistory.length === 0) return 1;
    return Math.max(...coinHistory.map((e) => Math.abs(e.coin![chartMetric])), 0.01);
  }, [coinHistory, chartMetric]);

  const metricLabel: Record<typeof chartMetric, string> = {
    pct: "Anteil %",
    totalAmount: "Gesamt",
    buyAmount: "Buy",
    sellAmount: "Sell",
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center">
        <p className="text-neutral-400">Lade Verlauf…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans antialiased">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-8">
          <h1 className="text-2xl tracking-tight text-neutral-100 mb-1">Verlauf</h1>
          <p className="text-neutral-400 text-sm">Tagesweise gespeicherte Portfolio-Auswertungen</p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300 text-sm">
            {error}
            {error.includes("existiert nicht") && (
              <p className="mt-2 text-xs text-neutral-400">
                Bitte folgende SQL-Migration in Supabase ausführen:
                <code className="block mt-1 bg-neutral-800 rounded p-2 text-xs font-mono whitespace-pre">
{`CREATE TABLE portfolio_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL,
  label text,
  coins jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);`}
                </code>
              </p>
            )}
          </div>
        )}

        {!error && snapshots.length === 0 && (
          <p className="text-neutral-500 text-sm">
            Noch keine Einträge. Auswertung durchführen und speichern.
          </p>
        )}

        {snapshots.length > 0 && (
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">

            {/* Snapshot-Liste links */}
            <div className="xl:col-span-1 rounded-2xl border border-neutral-800 bg-neutral-900/50 overflow-hidden self-start">
              <div className="px-4 py-3 border-b border-neutral-800 text-sm text-neutral-400">
                {snapshots.length} Einträge
              </div>
              <div className="max-h-[600px] overflow-y-auto">
                {snapshots.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSnapshot(s)}
                    className={`w-full text-left px-4 py-3 border-b border-neutral-800/50 hover:bg-neutral-800/40 transition-colors ${
                      selectedSnapshot?.id === s.id ? "bg-amber-500/10 border-l-2 border-l-amber-500" : ""
                    }`}
                  >
                    <p className="text-sm text-neutral-200 font-medium">{formatDate(s.snapshot_date)}</p>
                    {s.label && <p className="text-xs text-neutral-500 mt-0.5">{s.label}</p>}
                    <p className="text-xs text-neutral-600 mt-0.5">{s.coins.length} Coins</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Hauptbereich rechts */}
            <div className="xl:col-span-3 space-y-6">

              {/* Snapshot-Details */}
              {selectedSnapshot && (
                <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 overflow-hidden">
                  <div className="px-5 py-3 border-b border-neutral-800 flex justify-between items-center flex-wrap gap-2">
                    <span className="text-sm text-neutral-200 font-medium">
                      {formatDate(selectedSnapshot.snapshot_date)}
                    </span>
                    <span className="text-xs text-neutral-500">
                      {selectedSnapshot.coins.length} Coins · gespeichert {new Date(selectedSnapshot.created_at).toLocaleString("de-DE")}
                    </span>
                  </div>

                  {/* Balkendiagramm Snapshot */}
                  <div className="px-5 py-4 border-b border-neutral-800">
                    <div className="h-6 rounded-lg overflow-hidden flex">
                      {[...selectedSnapshot.coins]
                        .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
                        .map((c, i) => (
                          <div
                            key={c.name}
                            style={{ width: `${Math.abs(c.pct)}%`, backgroundColor: COLORS[i % COLORS.length], minWidth: c.pct > 0.3 ? "2px" : "0" }}
                            title={`${c.name}: ${c.pct.toFixed(1)}%`}
                          />
                        ))}
                    </div>
                  </div>

                  {/* Coin-Tabelle */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-neutral-500 border-b border-neutral-800 bg-neutral-900">
                          <th className="px-5 py-3 font-normal">Coin</th>
                          <th className="px-5 py-3 font-normal text-right">Buy</th>
                          <th className="px-5 py-3 font-normal text-right">Sell</th>
                          <th className="px-5 py-3 font-normal text-right">Gesamt</th>
                          <th className="px-5 py-3 font-normal text-right">Anteil</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...selectedSnapshot.coins]
                          .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
                          .map((c, i) => (
                            <tr key={c.name} className="border-b border-neutral-800/50 hover:bg-neutral-800/20">
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2">
                                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                  <span className="text-neutral-200">{c.name}</span>
                                </div>
                              </td>
                              <td className="px-5 py-3 text-right tabular-nums text-emerald-400">{formatAmount(c.buyAmount)}</td>
                              <td className="px-5 py-3 text-right tabular-nums text-red-400">{formatAmount(c.sellAmount)}</td>
                              <td className="px-5 py-3 text-right tabular-nums text-amber-400">{formatAmount(c.totalAmount)}</td>
                              <td className="px-5 py-3 text-right tabular-nums text-neutral-400">{c.pct.toFixed(2)}%</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Coin-Verlaufs-Chart */}
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 overflow-hidden">
                <div className="px-5 py-3 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm text-neutral-400">Coin-Verlauf</span>
                    <select
                      value={selectedCoin ?? ""}
                      onChange={(e) => setSelectedCoin(e.target.value || null)}
                      className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 focus:border-amber-500 focus:outline-none"
                    >
                      <option value="">— Coin wählen —</option>
                      {allCoins.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex rounded-lg border border-neutral-700 overflow-hidden text-xs">
                    {(["pct", "totalAmount", "buyAmount", "sellAmount"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setChartMetric(m)}
                        className={`px-3 py-1.5 transition-colors ${
                          chartMetric === m ? "bg-amber-500/20 text-amber-400" : "text-neutral-400 hover:bg-neutral-800"
                        }`}
                      >
                        {metricLabel[m]}
                      </button>
                    ))}
                  </div>
                </div>

                {!selectedCoin && (
                  <p className="px-5 py-8 text-center text-neutral-500 text-sm">Coin auswählen um den Verlauf zu sehen.</p>
                )}

                {selectedCoin && coinHistory.length === 0 && (
                  <p className="px-5 py-8 text-center text-neutral-500 text-sm">Keine Daten für {selectedCoin}.</p>
                )}

                {selectedCoin && coinHistory.length > 0 && (
                  <div className="p-5">
                    {/* Balkendiagramm */}
                    <div className="flex items-end gap-2 h-48 mb-3">
                      {coinHistory.map(({ snapshot, coin }) => {
                        const val = Math.abs(coin![chartMetric]);
                        const heightPct = chartMax > 0 ? (val / chartMax) * 100 : 0;
                        const isNeg = coin!.totalAmount < 0 && chartMetric === "totalAmount";
                        return (
                          <div
                            key={snapshot.id}
                            className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0"
                            title={`${formatDate(snapshot.snapshot_date)}: ${chartMetric === "pct" ? val.toFixed(2) + "%" : formatAmount(val)}`}
                          >
                            <span className="text-xs text-neutral-500 tabular-nums truncate w-full text-center">
                              {chartMetric === "pct" ? val.toFixed(1) + "%" : ""}
                            </span>
                            <div
                              className="w-full rounded-t-sm transition-all"
                              style={{
                                height: `${heightPct}%`,
                                backgroundColor: isNeg ? "#f87171" : "#f59e0b",
                                minHeight: "2px",
                              }}
                            />
                            <span className="text-xs text-neutral-600 truncate w-full text-center">
                              {formatDate(snapshot.snapshot_date).slice(0, 5)}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Legende */}
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-neutral-500 border-b border-neutral-800">
                            <th className="pb-2 text-left font-normal">Datum</th>
                            <th className="pb-2 text-right font-normal">Buy</th>
                            <th className="pb-2 text-right font-normal">Sell</th>
                            <th className="pb-2 text-right font-normal">Gesamt</th>
                            <th className="pb-2 text-right font-normal">Anteil</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...coinHistory].reverse().map(({ snapshot, coin }) => (
                            <tr key={snapshot.id} className="border-b border-neutral-800/40">
                              <td className="py-1.5 text-neutral-400">{formatDate(snapshot.snapshot_date)}</td>
                              <td className="py-1.5 text-right tabular-nums text-emerald-400">{formatAmount(coin!.buyAmount)}</td>
                              <td className="py-1.5 text-right tabular-nums text-red-400">{formatAmount(coin!.sellAmount)}</td>
                              <td className="py-1.5 text-right tabular-nums text-amber-400">{formatAmount(coin!.totalAmount)}</td>
                              <td className="py-1.5 text-right tabular-nums text-neutral-400">{coin!.pct.toFixed(2)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
