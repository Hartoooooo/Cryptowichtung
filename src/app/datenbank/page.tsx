"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

interface ConstituentWeight {
  name: string;
  weight: number;
}

interface WeightResult {
  id: string;
  isin: string;
  name: string;
  constituents: ConstituentWeight[];
  created_at: string;
}

const CHART_COLORS = [
  "#f59e0b",
  "#22d3ee",
  "#a78bfa",
  "#34d399",
  "#f472b6",
  "#fb923c",
  "#60a5fa",
  "#4ade80",
];

export default function DatenbankPage() {
  const [data, setData] = useState<WeightResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<WeightResult | null>(null);

  useEffect(() => {
    fetch("/api/weight-results")
      .then((res) => res.json())
      .then((result) => {
        if (result.error) {
          setError(result.error);
          return;
        }
        const items = Array.isArray(result) ? result : [];
        setData(items);
        if (items.length > 0) setSelected(items[0]);
      })
      .catch(() => setError("Fehler beim Laden"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center">
        <p className="text-neutral-400">Lade Datenbank…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans antialiased">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl tracking-tight">Datenbank & Kreisdiagramm</h1>
          <Link
            href="/"
            className="text-amber-400 hover:text-amber-300 text-sm"
          >
            ← Zurück
          </Link>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300 text-sm">
            {error}
          </div>
        )}

        {data.length === 0 && !error && (
          <p className="text-neutral-500">Noch keine Einträge in der Datenbank.</p>
        )}

        {data.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Liste */}
            <div className="lg:col-span-1 rounded-2xl border border-neutral-800 bg-neutral-900/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-800">
                <span className="text-sm text-neutral-400">
                  {data.length} Einträge
                </span>
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                {data.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelected(item)}
                    className={`w-full text-left px-4 py-3 border-b border-neutral-800/50 hover:bg-neutral-800/50 transition-colors ${
                      selected?.id === item.id ? "bg-amber-500/10 border-l-2 border-l-amber-500" : ""
                    }`}
                  >
                    <p className="font-mono text-sm text-neutral-200 truncate">
                      {item.isin}
                    </p>
                    <p className="text-xs text-neutral-500 truncate mt-0.5">
                      {item.name}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Kreisdiagramm + Details */}
            <div className="lg:col-span-2 space-y-6">
              {selected && (
                <>
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6">
                    <h2 className="text-lg font-medium text-neutral-100 mb-1">
                      {selected.name}
                    </h2>
                    <p className="font-mono text-sm text-neutral-500 mb-6">
                      {selected.isin}
                    </p>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={selected.constituents}
                            dataKey="weight"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius="80%"
                            label={(entry) => {
                              const w = entry?.value as number;
                              const n = entry?.name as string;
                              return w >= 5 ? `${n} ${w.toFixed(0)}%` : "";
                            }}
                          >
                            {selected.constituents.map((_, i) => (
                              <Cell
                                key={i}
                                fill={CHART_COLORS[i % CHART_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value) =>
                              typeof value === "number"
                                ? `${value.toFixed(2)}%`
                                : `${value}`
                            }
                            contentStyle={{
                              backgroundColor: "#262626",
                              border: "1px solid #404040",
                              borderRadius: "8px",
                            }}
                            labelStyle={{ color: "#e5e5e5" }}
                          />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 overflow-hidden">
                    <div className="px-5 py-3 border-b border-neutral-800">
                      <span className="text-sm text-neutral-400">
                        Konstituenten ({selected.constituents.length})
                      </span>
                    </div>
                    <ul className="divide-y divide-neutral-800">
                      {selected.constituents
                        .sort((a, b) => b.weight - a.weight)
                        .map((c, i) => (
                          <li
                            key={i}
                            className="flex justify-between px-5 py-3 text-sm"
                          >
                            <span
                              className="w-3 h-3 rounded-full shrink-0 mt-1.5 mr-2"
                              style={{
                                backgroundColor:
                                  CHART_COLORS[i % CHART_COLORS.length],
                              }}
                            />
                            <span className="flex-1 text-neutral-200">
                              {c.name}
                            </span>
                            <span className="text-neutral-400 tabular-nums">
                              {c.weight.toFixed(2)}%
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
