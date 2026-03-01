"use client";

import { useMemo } from "react";

export interface HeatmapBucket {
  hour: number;
  count: number;
  notional: number;
}

interface HeatmapChartProps {
  buckets: HeatmapBucket[];
  mode: "count" | "notional";
  maxCount?: number;
  maxNotional?: number;
}

export default function HeatmapChart({ buckets, mode, maxCount, maxNotional }: HeatmapChartProps) {
  const { maxVal, cells } = useMemo(() => {
    const maxC = maxCount ?? Math.max(1, ...buckets.map((b) => b.count));
    const maxN = maxNotional ?? Math.max(1, ...buckets.map((b) => b.notional));
    const max = mode === "count" ? maxC : maxN;

    const cells = Array.from({ length: 24 }, (_, hour) => {
      const b = buckets.find((x) => x.hour === hour) ?? { hour, count: 0, notional: 0 };
      const val = mode === "count" ? b.count : b.notional;
      const intensity = max > 0 ? Math.min(1, val / max) : 0;
      return { hour, val, intensity, count: b.count, notional: b.notional };
    });

    return { maxVal: max, cells };
  }, [buckets, mode, maxCount, maxNotional]);

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between text-xs text-neutral-500">
        <span>{mode === "count" ? "Trades" : "Notional"}</span>
        <span className="tabular-nums">{mode === "count" ? maxVal : maxVal.toLocaleString("de-DE")}</span>
      </div>
      <div className="grid gap-0.5" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
        {cells.map((c) => (
          <div
            key={c.hour}
            className="aspect-square min-w-0 rounded"
            style={{
              backgroundColor: `rgba(245, 158, 11, ${0.15 + c.intensity * 0.75})`,
            }}
            title={`${c.hour}:00 – ${c.hour + 1}:00 | Trades: ${c.count} | Notional: ${c.notional.toLocaleString("de-DE")}`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-neutral-600">
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h}>{h}:00</span>
        ))}
      </div>
    </div>
  );
}
