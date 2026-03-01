/**
 * Insight-Detektion für 1 Handelstag
 * Jede Insight: severity, confidence, explanation, affectedTradeIds
 */

import type { NormalizedTrade, BucketSize, Insight, InsightType } from "./types";
import type { BucketStats, GlobalBaseline, SymbolBucketStats } from "./baselines";
import { toBucketIndex, getSessionPhase, bucketKeyToTimeRange } from "./normalize";
import { median, mad, iqr, zScore } from "./baselines";

const EPSILON = 1e-10;

export interface InsightContext {
  trades: NormalizedTrade[];
  bucketStats: Map<number, BucketStats>;
  symbolBucketStats: SymbolBucketStats[];
  globalBaseline: GlobalBaseline;
  bucketSize: BucketSize;
  totalNotional: number;
  hasPnl: boolean;
  hasFees: boolean;
  hasTimestamps: boolean;
}

function makeInsight(
  type: InsightType,
  severity: number,
  confidence: number,
  title: string,
  explanation: string,
  metrics: Record<string, unknown>,
  affectedIds: string[],
  timeframe: { start: number | null; end: number | null },
  params?: Record<string, number | string>
): Insight {
  return {
    type,
    severity: Math.min(100, Math.max(0, severity)),
    confidence: Math.min(1, Math.max(0, confidence)),
    title,
    explanation,
    metrics,
    affectedTradeIds: affectedIds,
    timeframe,
    params,
  };
}

/** 1) Trade-Count Spike – pro Symbol + Uhrzeit eingrenzen (nicht jeder Trade einzeln) */
function detectTradeCountSpike(ctx: InsightContext): Insight[] {
  const out: Insight[] = [];
  const { symbolBucketStats, globalBaseline } = ctx;
  const threshold = 2.5;

  // Pro-Symbol-Baseline: typische Counts für dieses Symbol über alle Buckets
  const countsBySymbol = new Map<string, number[]>();
  for (const s of symbolBucketStats) {
    if (!countsBySymbol.has(s.symbol)) countsBySymbol.set(s.symbol, []);
    countsBySymbol.get(s.symbol)!.push(s.count);
  }

  for (const stats of symbolBucketStats) {
    if (stats.count < 3) continue;
    const symbolCounts = countsBySymbol.get(stats.symbol) ?? [];
    const z = symbolCounts.length >= 2 ? zScore(stats.count, symbolCounts) : zScore(stats.count, globalBaseline.countValues);
    if (z < threshold) continue;
    const symbolIqr = symbolCounts.length >= 4 ? iqr(symbolCounts) : null;
    const beyondIqr = symbolIqr ? stats.count > symbolIqr.upper : stats.count > globalBaseline.countIqr.upper;
    if (!beyondIqr && z < threshold) continue;

    const timeRange = bucketKeyToTimeRange(stats.bucketKey, ctx.bucketSize);
    const impact = ctx.trades.length > 0 ? stats.tradeIds.length / ctx.trades.length : 0;
    const severity = Math.min(100, 40 + Math.abs(z) * 10 + impact * 30);
    const confidence = Math.min(1, 0.5 + Math.min(stats.count, 20) / 40);
    const symbolBaseline = symbolCounts.length > 0 ? median(symbolCounts) : globalBaseline.countMedian;

    out.push(
      makeInsight(
        "TRADE_COUNT_SPIKE",
        severity,
        confidence,
        "Trade-Spike",
        `Ungewöhnlich viele Trades (${stats.count}) um ${timeRange} bei ${stats.symbol}. Normal für ${stats.symbol}: ~${symbolBaseline.toFixed(0)}/Bucket.`,
        { observed: stats.count, baseline: symbolBaseline, zScore: z, symbol: stats.symbol, timeRange },
        stats.tradeIds,
        { start: stats.bucketKey, end: stats.bucketKey },
        { threshold: String(threshold), symbol: stats.symbol }
      )
    );
  }
  return out;
}

/** 2) Notional Spike – pro Symbol + Uhrzeit eingrenzen */
function detectNotionalSpike(ctx: InsightContext): Insight[] {
  const out: Insight[] = [];
  const { symbolBucketStats, globalBaseline } = ctx;

  const notionalBySymbol = new Map<string, number[]>();
  for (const s of symbolBucketStats) {
    if (!notionalBySymbol.has(s.symbol)) notionalBySymbol.set(s.symbol, []);
    notionalBySymbol.get(s.symbol)!.push(s.notionalSum);
  }

  for (const stats of symbolBucketStats) {
    if (stats.count < 2) continue;
    const symbolNotionals = notionalBySymbol.get(stats.symbol) ?? [];
    const z = symbolNotionals.length >= 2 ? zScore(stats.notionalSum, symbolNotionals) : zScore(stats.notionalSum, globalBaseline.notionalValues);
    if (z < 2) continue;

    const timeRange = bucketKeyToTimeRange(stats.bucketKey, ctx.bucketSize);
    const impact = ctx.totalNotional > 0 ? stats.notionalSum / ctx.totalNotional : 0;
    const severity = Math.min(100, 35 + z * 8 + impact * 40);
    const confidence = 0.6 + Math.min(stats.count, 15) / 50;

    out.push(
      makeInsight(
        "NOTIONAL_SPIKE",
        severity,
        confidence,
        "Notional-Spike",
        `Ungewöhnlich hohes Notional (${stats.notionalSum.toLocaleString("de-DE")} €) um ${timeRange} bei ${stats.symbol}. Z-Score: ${z.toFixed(2)}.`,
        { observed: stats.notionalSum, baseline: globalBaseline.notionalMedian, zScore: z, symbol: stats.symbol, timeRange },
        stats.tradeIds,
        { start: stats.bucketKey, end: stats.bucketKey },
        { symbol: stats.symbol }
      )
    );
  }
  return out;
}

/** 3) Burstiness: viele Trades in sehr kurzer Zeit – mit Symbol-Einordnung */
function detectBurstiness(ctx: InsightContext): Insight[] {
  const out: Insight[] = [];
  const { trades } = ctx;
  if (!ctx.hasTimestamps || trades.length < 5) return out;

  const withTs = trades.filter((t) => t.timestamp != null).sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  const windowMs = 60 * 1000;
  let i = 0;
  while (i < withTs.length) {
    const start = withTs[i].timestamp!;
    const burst: NormalizedTrade[] = [];
    let j = i;
    while (j < withTs.length && (withTs[j].timestamp ?? 0) - start <= windowMs) {
      burst.push(withTs[j]);
      j++;
    }
    if (burst.length >= 5) {
      const ids = burst.map((t) => t.id);
      const bySym = new Map<string, number>();
      for (const t of burst) {
        bySym.set(t.symbol, (bySym.get(t.symbol) ?? 0) + 1);
      }
      const top = [...bySym.entries()].sort((a, b) => b[1] - a[1])[0];
      const timeStr = new Date(start).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
      const symbolHint = top && top[1] >= burst.length * 0.7 ? ` bei ${top[0]}` : "";
      const severity = Math.min(100, 30 + burst.length * 5);
      out.push(
        makeInsight(
          "BURSTINESS",
          severity,
          0.7,
          "Mikro-Burst",
          `${burst.length} Trades innerhalb 1 Min um ${timeStr}${symbolHint}.`,
          { count: burst.length, windowSeconds: 60, symbol: top?.[0], timeRange: timeStr },
          ids,
          { start: Math.floor((start / 60000) % 1440), end: null }
        )
      );
    }
    i = j;
  }
  return out;
}

/** 4) Quiet Period */
function detectQuietPeriod(ctx: InsightContext): Insight[] {
  const out: Insight[] = [];
  const { bucketStats, globalBaseline } = ctx;
  const activeBuckets = Array.from(bucketStats.keys()).length;
  if (activeBuckets < 3) return out;

  for (const [, stats] of bucketStats) {
    if (stats.count > 0) continue;
    // Bucket mit 0 Trades, aber andere Buckets haben viele – evtl. Lücke
    const avgActive = globalBaseline.countMedian;
    if (avgActive < 2) continue;

    const neighbors = [stats.bucketKey - 1, stats.bucketKey + 1].filter((k) => bucketStats.has(k));
    const neighborCount = neighbors.reduce((s, k) => s + (bucketStats.get(k)?.count ?? 0), 0);
    if (neighborCount < 4) continue;

    out.push(
      makeInsight(
        "QUIET_PERIOD",
        25,
        0.5,
        "Ruhige Phase",
        `Keine Trades in diesem Zeitfenster, obwohl benachbarte Fenster aktiv sind (Ø ${avgActive.toFixed(0)} Trades).`,
        { observed: 0, baseline: avgActive },
        [],
        { start: stats.bucketKey, end: stats.bucketKey }
      )
    );
  }
  return out;
}

/** 5) Open/Close Konzentration */
function detectOpenCloseConcentration(ctx: InsightContext): Insight[] {
  const out: Insight[] = [];
  const { trades } = ctx;
  if (!ctx.hasTimestamps || trades.length < 10) return out;

  const withTs = trades.filter((t) => t.timestamp != null);
  const firstHour = withTs.filter((t) => {
    const d = new Date(t.timestamp!);
    const mod = d.getHours() * 60 + d.getMinutes();
    return mod < 60;
  });
  const lastHour = withTs.filter((t) => {
    const d = new Date(t.timestamp!);
    const mod = d.getHours() * 60 + d.getMinutes();
    return mod >= 23 * 60; // 23:00–24:00
  });
  const openHour = withTs.filter((t) => {
    const d = new Date(t.timestamp!);
    const h = d.getHours();
    return h >= 8 && h < 9;
  });
  const closeHour = withTs.filter((t) => {
    const d = new Date(t.timestamp!);
    const h = d.getHours();
    return h >= 16 && h < 17;
  });

  for (const [label, group] of [
    ["Erste Stunde", firstHour],
    ["Letzte Stunde", lastHour],
    ["Open (8–9 Uhr)", openHour],
    ["Close (16–17 Uhr)", closeHour],
  ] as const) {
    const pct = withTs.length > 0 ? group.length / withTs.length : 0;
    if (pct > 0.4 && group.length >= 5) {
      out.push(
        makeInsight(
          "OPEN_CLOSE_CONCENTRATION",
          Math.min(100, 20 + pct * 80),
          0.6,
          "Open/Close Konzentration",
          `${(pct * 100).toFixed(0)}% der Trades in ${label} (${group.length} Trades).`,
          { pct, count: group.length },
          group.map((t) => t.id),
          { start: null, end: null }
        )
      );
    }
  }
  return out;
}

/** 6) Lunchtime Dip/Overtrade */
function detectLunchtimeAnomaly(ctx: InsightContext): Insight[] {
  const { trades, bucketStats } = ctx;
  if (!ctx.hasTimestamps || trades.length < 15) return [];

  const lunchBuckets = [11 * 4, 12 * 4, 13 * 4]; // 11–14 Uhr bei 15m
  const lunchCount = lunchBuckets.reduce((s, k) => s + (bucketStats.get(k)?.count ?? 0), 0);
  const otherCount = Array.from(bucketStats.values()).reduce((s, b) => s + b.count, 0) - lunchCount;
  const lunchBucketsActive = lunchBuckets.filter((k) => bucketStats.has(k)).length;
  const otherBuckets = Array.from(bucketStats.keys()).filter((k) => !lunchBuckets.includes(k)).length;
  const otherAvg = otherBuckets > 0 ? otherCount / otherBuckets : 0;
  const lunchAvg = lunchBucketsActive > 0 ? lunchCount / lunchBucketsActive : 0;

  const ratio = otherAvg > 0 ? lunchAvg / otherAvg : 0;
  if (ratio > 2 && lunchCount >= 5) {
    const ids = lunchBuckets.flatMap((k) => bucketStats.get(k)?.tradeIds ?? []);
    return [
      makeInsight(
        "LUNCHTIME_ANOMALY",
        50,
        0.6,
        "Mittags-Überhandel",
        `Deutlich mehr Aktivität im Mittagsband (12–14 Uhr): ${lunchAvg.toFixed(1)} vs Ø ${otherAvg.toFixed(1)} Trades/Bucket.`,
        { lunchAvg, otherAvg, ratio },
        ids as string[],
        { start: 11 * 4, end: 13 * 4 }
      ),
    ];
  }
  if (ratio < 0.3 && otherCount > 10) {
    return [
      makeInsight(
        "LUNCHTIME_ANOMALY",
        35,
        0.5,
        "Mittags-Dip",
        `Weniger Aktivität im Mittagsband: ${lunchAvg.toFixed(1)} vs Ø ${otherAvg.toFixed(1)} Trades/Bucket.`,
        { lunchAvg, otherAvg, ratio },
        lunchBuckets.flatMap((k) => bucketStats.get(k)?.tradeIds ?? []) as string[],
        { start: 11 * 4, end: 13 * 4 }
      ),
    ];
  }
  return [];
}

/** 7) Symbol Dominance Shift */
function detectSymbolDominanceShift(ctx: InsightContext): Insight[] {
  const { trades } = ctx;
  if (!ctx.hasTimestamps || trades.length < 20) return [];

  const withTs = trades.filter((t) => t.timestamp != null).sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  const mid = Math.floor(withTs.length / 2);
  const firstHalf = withTs.slice(0, mid);
  const secondHalf = withTs.slice(mid);

  const topSymbol = (arr: NormalizedTrade[]) => {
    const bySym = new Map<string, number>();
    for (const t of arr) {
      bySym.set(t.symbol, (bySym.get(t.symbol) ?? 0) + t.notional);
    }
    let top = "";
    let max = 0;
    for (const [s, v] of bySym) {
      if (v > max) {
        max = v;
        top = s;
      }
    }
    return top;
  };

  const top1 = topSymbol(firstHalf);
  const top2 = topSymbol(secondHalf);
  if (top1 && top2 && top1 !== top2) {
    const ids = [...firstHalf, ...secondHalf].filter((t) => t.symbol === top1 || t.symbol === top2).map((t) => t.id);
    return [
      makeInsight(
        "SYMBOL_DOMINANCE_SHIFT",
        55,
        0.7,
        "Symbol-Wechsel",
        `Top-Symbol wechselt von ${top1} (erste Tageshälfte) zu ${top2} (zweite Hälfte).`,
        { firstHalf: top1, secondHalf: top2 },
        ids,
        { start: null, end: null }
      ),
    ];
  }
  return [];
}

/** 8) Notional Concentration */
function detectNotionalConcentration(ctx: InsightContext): Insight[] {
  const { trades } = ctx;
  if (trades.length < 5) return [];

  const bySymbol = new Map<string, number>();
  for (const t of trades) {
    bySymbol.set(t.symbol, (bySymbol.get(t.symbol) ?? 0) + t.notional);
  }
  const sorted = [...bySymbol.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  if (!top) return [];
  const pct = ctx.totalNotional > 0 ? top[1] / ctx.totalNotional : 0;
  if (pct > 0.8) {
    const ids = trades.filter((t) => t.symbol === top[0]).map((t) => t.id);
    return [
      makeInsight(
        "NOTIONAL_CONCENTRATION",
        Math.min(100, 30 + pct * 70),
        0.8,
        "Symbol-Konzentration",
        `${top[0]} macht ${(pct * 100).toFixed(0)}% des Tagesnotional aus.`,
        { symbol: top[0], pct, notional: top[1] },
        ids,
        { start: null, end: null }
      ),
    ];
  }
  return [];
}

/** 9) Flip-Flop: BUY->SELL->BUY auf gleichem Symbol in kurzer Zeit */
function detectFlipFlop(ctx: InsightContext): Insight[] {
  const { trades } = ctx;
  if (!ctx.hasTimestamps || trades.length < 5) return [];

  const bySymbol = new Map<string, NormalizedTrade[]>();
  for (const t of trades) {
    if (!bySymbol.has(t.symbol)) bySymbol.set(t.symbol, []);
    bySymbol.get(t.symbol)!.push(t);
  }

  const out: Insight[] = [];
  const windowMs = 5 * 60 * 1000; // 5 Min

  for (const [, arr] of bySymbol) {
    const sorted = [...arr].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
    for (let i = 0; i < sorted.length - 2; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const c = sorted[i + 2];
      if (!a.timestamp || !b.timestamp || !c.timestamp) continue;
      if (c.timestamp - a.timestamp > windowMs) continue;
      const sides = [a.side, b.side, c.side].join(",");
      if (sides === "BUY,SELL,BUY" || sides === "SELL,BUY,SELL") {
        out.push(
          makeInsight(
            "FLIP_FLOP",
            60,
            0.75,
            "Flip-Flop",
            `Schneller Side-Wechsel (${a.side}→${b.side}→${c.side}) auf ${a.symbol} innerhalb von ${Math.round((c.timestamp - a.timestamp) / 1000)}s.`,
            { windowSeconds: 300 },
            [a.id, b.id, c.id],
            { start: Math.floor((a.timestamp / 60000) % 1440), end: Math.floor((c.timestamp / 60000) % 1440) }
          )
        );
        break; // pro Symbol nur einmal
      }
    }
  }
  return out;
}

/** 10) Clone Trades: identische qty oder sehr ähnliche Preise */
function detectCloneTrades(ctx: InsightContext): Insight[] {
  const { trades } = ctx;

  // Identische qty (oder wenige Stufen)
  const byQty = new Map<string, NormalizedTrade[]>();
  for (const t of trades) {
    const key = t.qty > 0 ? String(t.qty) : "0";
    if (!byQty.has(key)) byQty.set(key, []);
    byQty.get(key)!.push(t);
  }

  const out: Insight[] = [];
  for (const [qtyStr, arr] of byQty) {
    if (qtyStr === "0" && trades.some((t) => t.qty > 0)) continue;
    if (arr.length >= 5) {
      const severity = Math.min(100, 25 + arr.length * 3);
      out.push(
        makeInsight(
          "CLONE_TRADES",
          severity,
          0.6,
          "Clone-Trades (gleiche Menge)",
          `${arr.length} Trades mit identischer Menge (qty=${qtyStr}). Möglicher Algo-Split.`,
          { count: arr.length, qty: parseFloat(qtyStr) || 0 },
          arr.map((t) => t.id),
          { start: null, end: null }
        )
      );
    }
  }

  // Notional-basiert wenn keine qty
  if (!trades.some((t) => t.qty > 0)) {
    const byNotional = new Map<string, NormalizedTrade[]>();
    for (const t of trades) {
      const rounded = Math.round(t.notional / 100) * 100;
      const key = String(rounded);
      if (!byNotional.has(key)) byNotional.set(key, []);
      byNotional.get(key)!.push(t);
    }
    for (const [n, arr] of byNotional) {
      if (arr.length >= 5) {
        out.push(
          makeInsight(
            "CLONE_TRADES",
            40,
            0.5,
            "Clone-Trades (ähnliches Notional)",
            `${arr.length} Trades mit ähnlichem Notional (~${n}).`,
            { count: arr.length, notional: parseFloat(n) },
            arr.map((t) => t.id),
            { start: null, end: null }
          )
        );
      }
    }
  }
  return out;
}

/** 11) Fee Churn */
function detectFeeChurn(ctx: InsightContext): Insight[] {
  if (!ctx.hasFees || ctx.trades.length < 5) return [];

  const highFeeTrades = ctx.trades.filter((t) => {
    const ratio = (t.fees ?? 0) / Math.max(t.notional, EPSILON);
    return ratio > 0.01; // >1% Fee/Notional
  });
  if (highFeeTrades.length < 3) return [];

  const totalFees = ctx.trades.reduce((s, t) => s + (t.fees ?? 0), 0);
  const feeRatio = ctx.totalNotional > 0 ? totalFees / ctx.totalNotional : 0;
  const pct = ctx.trades.length > 0 ? highFeeTrades.length / ctx.trades.length : 0;

  return [
    makeInsight(
      "FEE_CHURN",
      Math.min(100, 35 + feeRatio * 500 + pct * 30),
      0.7,
      "Fee Churn",
      `${highFeeTrades.length} Trades mit hohem Fee-Anteil (>1% vom Notional). Gesamt-Fees: ${totalFees.toLocaleString("de-DE")}.`,
      { highFeeCount: highFeeTrades.length, feeRatio, totalFees },
      highFeeTrades.map((t) => t.id),
      { start: null, end: null }
    ),
  ];
}

/** 12) Duplicate/Replay */
function detectDuplicateReplay(ctx: InsightContext): Insight[] {
  const { trades } = ctx;
  const seen = new Map<string, NormalizedTrade[]>();

  for (const t of trades) {
    const key = `${t.timestamp ?? ""}_${t.symbol}_${t.qty}_${t.price}`;
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key)!.push(t);
  }

  const dupes: string[] = [];
  for (const [, arr] of seen) {
    if (arr.length > 1) dupes.push(...arr.map((t) => t.id));
  }
  if (dupes.length < 2) return [];

  return [
    makeInsight(
      "DUPLICATE_REPLAY",
      70,
      0.85,
      "Duplikate/Replay",
      `${dupes.length} Trades mit identischem timestamp+symbol+qty+price (Duplikate oder Replay).`,
      { duplicateCount: dupes.length },
      dupes,
      { start: null, end: null }
    ),
  ];
}

/** 13) Loss Streak (falls PnL) */
function detectLossStreak(ctx: InsightContext): Insight[] {
  if (!ctx.hasPnl || ctx.trades.length < 5) return [];

  const withPnl = ctx.trades.filter((t) => t.pnl != null);
  let maxStreak = 0;
  let streakStart = -1;
  let current = 0;
  let start = -1;

  for (let i = 0; i < withPnl.length; i++) {
    const loss = (withPnl[i].pnl ?? 0) < 0;
    if (loss) {
      if (current === 0) start = i;
      current++;
      if (current > maxStreak) {
        maxStreak = current;
        streakStart = start;
      }
    } else {
      current = 0;
    }
  }

  if (maxStreak >= 3) {
    const affected = withPnl.slice(streakStart, streakStart + maxStreak).map((t) => t.id);
    return [
      makeInsight(
        "LOSS_STREAK",
        Math.min(100, 30 + maxStreak * 15),
        0.75,
        "Verlustserie",
        `${maxStreak} aufeinanderfolgende Verlusttrades.`,
        { streakLength: maxStreak },
        affected,
        { start: null, end: null }
      ),
    ];
  }
  return [];
}

/** 14) Post-Loss Escalation */
function detectPostLossEscalation(ctx: InsightContext): Insight[] {
  if (!ctx.hasPnl || !ctx.hasTimestamps || ctx.trades.length < 10) return [];

  const withPnl = ctx.trades.filter((t) => t.pnl != null).sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  const windowMs = 10 * 60 * 1000; // 10 Min nach Großverlust

  for (let i = 0; i < withPnl.length; i++) {
    const pnl = withPnl[i].pnl ?? 0;
    if (pnl >= -100) continue; // nur große Verluste
    const after = withPnl.slice(i + 1).filter((t) => (t.timestamp ?? 0) - (withPnl[i].timestamp ?? 0) <= windowMs);
    const beforeAvg = i > 0 ? i / Math.max(1, (withPnl[i].timestamp! - withPnl[0].timestamp!) / 60000) : 0;
    const afterRate = after.length / 10; // pro 10 Min
    if (afterRate > beforeAvg * 1.5 && after.length >= 3) {
      const ids = [withPnl[i].id, ...after.map((t) => t.id)];
      return [
        makeInsight(
          "POST_LOSS_ESCALATION",
          65,
          0.65,
          "Post-Loss Eskalation",
          `Nach großem Verlust (${pnl.toFixed(0)}) steigt die Handelsfrequenz in den nächsten 10 Min deutlich.`,
          { lossAmount: pnl, afterCount: after.length },
          ids,
          { start: null, end: null }
        ),
      ];
    }
  }
  return [];
}

/** 15) Skew Pattern */
function detectSkewPattern(ctx: InsightContext): Insight[] {
  if (!ctx.hasPnl || ctx.trades.length < 15) return [];

  const wins = ctx.trades.filter((t) => (t.pnl ?? 0) > 0);
  const losses = ctx.trades.filter((t) => (t.pnl ?? 0) < 0);
  const winSum = wins.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const lossSum = Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 0));

  if (lossSum < EPSILON) return [];
  const skew = wins.length / Math.max(1, losses.length);
  const avgWin = wins.length > 0 ? winSum / wins.length : 0;
  const avgLoss = losses.length > 0 ? lossSum / losses.length : 0;
  if (avgWin < avgLoss * 0.5 && skew > 2) {
    return [
      makeInsight(
        "SKEW_PATTERN",
        55,
        0.7,
        "Skew-Muster",
        `Viele kleine Gewinne (${wins.length}) vs wenige große Verluste (${losses.length}). Durchschnitt Gewinn: ${avgWin.toFixed(0)}, Verlust: ${avgLoss.toFixed(0)}.`,
        { winCount: wins.length, lossCount: losses.length, avgWin, avgLoss },
        [...wins, ...losses].map((t) => t.id),
        { start: null, end: null }
      ),
    ];
  }
  return [];
}

/** 16) Timestamp Issues */
function detectTimestampIssues(ctx: InsightContext): Insight[] {
  const { trades } = ctx;
  const noTs = trades.filter((t) => t.timestamp == null);
  if (noTs.length === 0) return [];

  const pct = trades.length > 0 ? noTs.length / trades.length : 0;
  return [
    makeInsight(
      "TIMESTAMP_ISSUES",
      Math.min(100, pct * 150),
      0.9,
      "Fehlende Timestamps",
      `${noTs.length} von ${trades.length} Trades haben keinen gültigen Timestamp. Zeitbasierte Analysen eingeschränkt.`,
      { missingCount: noTs.length, total: trades.length, pct },
      noTs.map((t) => t.id),
      { start: null, end: null }
    ),
  ];
}

/** 17) Missing Core Fields */
function detectMissingCoreFields(ctx: InsightContext): Insight[] {
  const { trades } = ctx;
  let missingQty = 0;
  let missingPrice = 0;
  let missingSymbol = 0;
  for (const t of trades) {
    if (!t.symbol || t.symbol === "?") missingSymbol++;
    if (t.qty <= 0 && t.price <= 0) missingPrice++;
    if (t.qty <= 0) missingQty++;
  }
  const pct = Math.max(
    trades.length > 0 ? missingSymbol / trades.length : 0,
    trades.length > 0 ? missingQty / trades.length : 0
  );
  if (pct < 0.1) return [];

  return [
    makeInsight(
      "MISSING_CORE_FIELDS",
      Math.min(100, pct * 120),
      0.8,
      "Fehlende Kerndaten",
      `Hoher Anteil fehlender Felder: Symbol ${missingSymbol}, Qty ${missingQty}, Price ${missingPrice}.`,
      { missingSymbol, missingQty, missingPrice, total: trades.length },
      [],
      { start: null, end: null }
    ),
  ];
}

export function runAllInsights(ctx: InsightContext): Insight[] {
  const all: Insight[] = [];
  all.push(...detectTradeCountSpike(ctx));
  all.push(...detectNotionalSpike(ctx));
  all.push(...detectBurstiness(ctx));
  all.push(...detectQuietPeriod(ctx));
  all.push(...detectOpenCloseConcentration(ctx));
  all.push(...detectLunchtimeAnomaly(ctx));
  all.push(...detectSymbolDominanceShift(ctx));
  all.push(...detectNotionalConcentration(ctx));
  all.push(...detectFlipFlop(ctx));
  all.push(...detectCloneTrades(ctx));
  all.push(...detectFeeChurn(ctx));
  all.push(...detectDuplicateReplay(ctx));
  all.push(...detectLossStreak(ctx));
  all.push(...detectPostLossEscalation(ctx));
  all.push(...detectSkewPattern(ctx));
  all.push(...detectTimestampIssues(ctx));
  all.push(...detectMissingCoreFields(ctx));

  return dedupeInsights(all);
}

/** Merge angrenzende Insights gleichen Typs */
function dedupeInsights(insights: Insight[]): Insight[] {
  const byType = new Map<InsightType, Insight[]>();
  for (const i of insights) {
    if (!byType.has(i.type)) byType.set(i.type, []);
    byType.get(i.type)!.push(i);
  }

  const out: Insight[] = [];
  for (const [, arr] of byType) {
    const sorted = arr.sort((a, b) => b.severity - a.severity);
    const merged = new Set<string>();
    for (const i of sorted) {
      const key = `${i.type}_${i.timeframe.start}_${i.timeframe.end}`;
      if (merged.has(key)) continue;
      merged.add(key);
      out.push(i);
    }
  }
  return out.sort((a, b) => b.severity - a.severity);
}
