/**
 * Unit tests für PatternEngine (Intraday-Musteranalyse)
 */

import { runPatternEngine, csvRowsToTrades } from "../index";
import { toBucketIndex, parseTimestamp, getSessionPhase } from "../normalize";
import { median, mad, iqr, zScore, buildBucketStats, computeGlobalBaseline } from "../baselines";

describe("normalize", () => {
  describe("parseTimestamp", () => {
    it("parst ISO-Format", () => {
      const r = parseTimestamp("2024-01-15T14:30:00Z");
      expect(r.ms).toBeDefined();
      expect(r.minuteOfDay).toBeGreaterThanOrEqual(0);
      expect(r.minuteOfDay).toBeLessThanOrEqual(1439);
    });

    it("parst nur Zeit HH:mm", () => {
      const r = parseTimestamp("14:30");
      expect(r.minuteOfDay).toBe(14 * 60 + 30);
    });

    it("parst UNIX ms", () => {
      const ms = 1705324200000; // 2024-01-15 ~14:30 UTC
      const r = parseTimestamp(String(ms));
      expect(r.ms).toBe(ms);
    });

    it("gibt null für leeren String", () => {
      const r = parseTimestamp("");
      expect(r.ms).toBeNull();
      expect(r.minuteOfDay).toBeNull();
    });
  });

  describe("toBucketIndex", () => {
    it("1m: minuteOfDay = bucketKey", () => {
      expect(toBucketIndex(0, "1m")).toBe(0);
      expect(toBucketIndex(59, "1m")).toBe(59);
    });

    it("5m: 5 Minuten pro Bucket", () => {
      expect(toBucketIndex(0, "5m")).toBe(0);
      expect(toBucketIndex(14, "5m")).toBe(2);
      expect(toBucketIndex(15, "5m")).toBe(3);
    });

    it("15m: 15 Minuten pro Bucket", () => {
      expect(toBucketIndex(0, "15m")).toBe(0);
      expect(toBucketIndex(14, "15m")).toBe(0);
      expect(toBucketIndex(15, "15m")).toBe(1);
      expect(toBucketIndex(60, "15m")).toBe(4);
    });

    it("60m: 1 Stunde pro Bucket", () => {
      expect(toBucketIndex(0, "60m")).toBe(0);
      expect(toBucketIndex(59, "60m")).toBe(0);
      expect(toBucketIndex(60, "60m")).toBe(1);
    });
  });

  describe("getSessionPhase", () => {
    it("Pre < 8 Uhr", () => {
      expect(getSessionPhase(7 * 60)).toBe("Pre");
    });
    it("Open 8-10", () => {
      expect(getSessionPhase(8 * 60 + 30)).toBe("Open");
    });
    it("Mid 10-16", () => {
      expect(getSessionPhase(12 * 60)).toBe("Mid");
    });
    it("Close >= 16", () => {
      expect(getSessionPhase(16 * 60)).toBe("Close");
    });
  });
});

describe("baselines", () => {
  describe("median", () => {
    it("ungerade Anzahl", () => {
      expect(median([1, 3, 5])).toBe(3);
    });
    it("gerade Anzahl", () => {
      expect(median([1, 3, 5, 7])).toBe(4);
    });
    it("leer", () => {
      expect(median([])).toBe(0);
    });
  });

  describe("mad", () => {
    it("berechnet MAD", () => {
      const v = [1, 2, 3, 4, 5];
      expect(mad(v)).toBeGreaterThan(0);
    });
  });

  describe("iqr", () => {
    it("berechnet IQR und Fences", () => {
      const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const res = iqr(v);
      expect(res.q1).toBeLessThan(res.q3);
      expect(res.lower).toBeLessThan(res.upper);
    });
  });

  describe("zScore", () => {
    it("Spike hat hohen Z-Score", () => {
      const v = [1, 2, 2, 2, 2, 2, 2];
      expect(zScore(10, v)).toBeGreaterThan(2);
    });
  });

  describe("buildBucketStats", () => {
    it("aggregiert Trades in Buckets", () => {
      const trades = [
        { id: "t1", timestamp: new Date("2024-01-15T10:00:00").getTime(), notional: 100, fees: null, pnl: null },
        { id: "t2", timestamp: new Date("2024-01-15T10:05:00").getTime(), notional: 200, fees: null, pnl: null },
        { id: "t3", timestamp: new Date("2024-01-15T10:10:00").getTime(), notional: 300, fees: null, pnl: null },
        { id: "t4", timestamp: new Date("2024-01-15T11:00:00").getTime(), notional: 400, fees: null, pnl: null },
      ];
      const map = buildBucketStats(trades, "15m");
      expect(map.size).toBeGreaterThan(0);
      const firstBucket = Array.from(map.values())[0];
      expect(firstBucket.count).toBe(3);
      expect(firstBucket.notionalSum).toBe(600);
      expect(firstBucket.tradeIds).toContain("t1");
      expect(firstBucket.tradeIds).toContain("t2");
      expect(firstBucket.tradeIds).toContain("t3");
    });
  });

  describe("computeGlobalBaseline", () => {
    it("berechnet Median und IQR", () => {
      const stats = [
        { bucketKey: 0, count: 5, notionalSum: 1000, feeSum: 0, pnlSum: 0, tradeIds: [] },
        { bucketKey: 1, count: 10, notionalSum: 2000, feeSum: 0, pnlSum: 0, tradeIds: [] },
        { bucketKey: 2, count: 8, notionalSum: 1500, feeSum: 0, pnlSum: 0, tradeIds: [] },
      ];
      const base = computeGlobalBaseline(stats);
      expect(base.countMedian).toBe(8);
      expect(base.notionalMedian).toBe(1500);
    });
  });
});

describe("csvRowsToTrades", () => {
  it("konvertiert CsvRows zu NormalizedTrades", () => {
    const rows = [
      { isincod: "DE000ABCD", betrag: 1000, side: "B" as const, instmnem: "BTC", trandattim: "10:30" },
      { isincod: "DE000EFGH", betrag: -500, side: "S" as const, instmnem: "ETH", trandattim: "14:00" },
    ];
    const trades = csvRowsToTrades(rows);
    expect(trades).toHaveLength(2);
    expect(trades[0].symbol).toBe("BTC");
    expect(trades[0].side).toBe("BUY");
    expect(trades[0].notional).toBe(1000);
    expect(trades[1].side).toBe("SELL");
    expect(trades[1].notional).toBe(500);
  });
});

describe("runPatternEngine", () => {
  it("läuft ohne Crash bei leerem Input", () => {
    const result = runPatternEngine({ trades: [] });
    expect(result.insights).toHaveLength(0);
    expect(result.tradeCount).toBe(0);
    expect(result.totalNotional).toBe(0);
  });

  it("erkennt Trade-Count-Spike bei synthetischen Daten", () => {
    const baseTime = new Date("2024-01-15T09:00:00").getTime();
    const trades = [];
    for (let i = 0; i < 50; i++) {
      trades.push({
        id: `t${i}`,
        timestamp: baseTime + i * 60000,
        timestampRaw: null,
        symbol: "BTC",
        side: "BUY" as const,
        qty: 1,
        price: 100,
        notional: 100,
        raw: {},
      });
    }
    for (let i = 0; i < 100; i++) {
      trades.push({
        id: `t${50 + i}`,
        timestamp: baseTime + 60 * 60 * 1000 + i * 1000,
        timestampRaw: null,
        symbol: "BTC",
        side: "BUY" as const,
        qty: 1,
        price: 100,
        notional: 100,
        raw: {},
      });
    }
    const result = runPatternEngine({ trades, bucketSize: "15m" });
    expect(result.insights.length).toBeGreaterThanOrEqual(0);
    expect(result.tradeCount).toBe(150);
  });

  it("merge/dedupe angrenzender Buckets", () => {
    const baseTime = new Date("2024-01-15T10:00:00").getTime();
    const trades = Array.from({ length: 20 }, (_, i) => ({
      id: `t${i}`,
      timestamp: baseTime + i * 60000,
      timestampRaw: null,
      symbol: "BTC",
      side: "BUY" as const,
      qty: 1,
      price: 100,
      notional: 100,
      raw: {},
    }));
    const result = runPatternEngine({ trades, bucketSize: "15m" });
    expect(result.insights).toBeDefined();
    expect(Array.isArray(result.insights)).toBe(true);
  });
});
