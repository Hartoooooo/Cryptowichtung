"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";

interface ConstituentWeight {
  name: string;
  weight: number;
}

// Ticker/Name → CoinGecko API id
const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  Bitcoin: "bitcoin",
  ETH: "ethereum",
  Ethereum: "ethereum",
  XRP: "ripple",
  Ripple: "ripple",
  SOL: "solana",
  Solana: "solana",
  ADA: "cardano",
  Cardano: "cardano",
  DOT: "polkadot",
  Polkadot: "polkadot",
  LTC: "litecoin",
  Litecoin: "litecoin",
  AVAX: "avalanche-2",
  Avalanche: "avalanche-2",
  MATIC: "matic-network",
  Polygon: "matic-network",
  LINK: "chainlink",
  Chainlink: "chainlink",
  UNI: "uniswap",
  Uniswap: "uniswap",
  ICP: "internet-computer",
  NEAR: "near",
  APT: "aptos",
  SUI: "sui",
  ATOM: "cosmos",
  BNB: "binancecoin",
  DOGE: "dogecoin",
  FIL: "filecoin",
  HBAR: "hedera-hashgraph",
  VET: "vechain",
  ALGO: "algorand",
  XLM: "stellar",
  TON: "the-open-network",
  ARB: "arbitrum",
  OP: "optimism",
  INJ: "injective-protocol",
  TIA: "celestia",
  STX: "blockstack",
};

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

const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

export default function DatenbankPage() {
  const [data, setData] = useState<WeightResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<WeightResult | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [searchIsin, setSearchIsin] = useState("");
  const [searchResult, setSearchResult] = useState<WeightResult | "not_found" | null>(null);

  const sortedData = useMemo(
    () =>
      [...data].sort(
        (a, b) => (b.constituents?.length ?? 0) - (a.constituents?.length ?? 0)
      ),
    [data]
  );

  const coinGeckoIds = useMemo(() => {
    if (!selected) return [];
    const ids = new Set<string>();
    for (const c of selected.constituents) {
      const id = COINGECKO_IDS[c.name];
      if (id) ids.add(id);
    }
    return Array.from(ids);
  }, [selected]);

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
        const sorted = [...items].sort(
          (a, b) => (b.constituents?.length ?? 0) - (a.constituents?.length ?? 0)
        );
        if (sorted.length > 0) setSelected(sorted[0]);
      })
      .catch(() => setError("Fehler beim Laden"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (coinGeckoIds.length === 0) {
      setPrices({});
      return;
    }
    const ids = coinGeckoIds.join(",");
    fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`)
      .then((res) => res.json())
      .then((data) => {
        const out: Record<string, number> = {};
        for (const [id, obj] of Object.entries(data)) {
          const usd = (obj as { usd?: number }).usd;
          if (typeof usd === "number") out[id] = usd;
        }
        setPrices(out);
      })
      .catch(() => setPrices({}));
  }, [coinGeckoIds.join(",")]);

  const handleSearch = () => {
    const normalized = searchIsin.trim().toUpperCase().replace(/\s/g, "");
    if (!normalized) {
      setSearchResult(null);
      return;
    }
    if (!ISIN_REGEX.test(normalized)) {
      setSearchResult("not_found");
      return;
    }
    const match = data.find((d) => d.isin.toUpperCase() === normalized);
    if (match) {
      setSearchResult(match);
      setSelected(match);
    } else {
      setSearchResult("not_found");
    }
  };

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
          <h1 className="text-2xl tracking-tight">Datenbank & Gewichtung</h1>
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
              <div className="px-4 py-3 border-b border-neutral-800 space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchIsin}
                    onChange={(e) => {
                      setSearchIsin(e.target.value.toUpperCase());
                      setSearchResult(null);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="ISIN suchen..."
                    className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-amber-500 focus:outline-none"
                    maxLength={12}
                  />
                  <button
                    onClick={handleSearch}
                    className="rounded-lg bg-amber-500 px-3 py-2 text-sm text-neutral-950 font-medium hover:bg-amber-400 shrink-0"
                  >
                    Suchen
                  </button>
                </div>
                {searchResult === "not_found" && (
                  <p className="text-xs text-amber-400">Nicht in der Datenbank</p>
                )}
                {searchResult && searchResult !== "not_found" && (
                  <p className="text-xs text-emerald-400">Gefunden</p>
                )}
                <span className="text-sm text-neutral-400 block">
                  {data.length} Einträge (nach Konst. sortiert)
                </span>
              </div>
              <div
                className="overflow-y-auto transition-[max-height] duration-200"
                style={{
                  maxHeight: `${52 * (1 + (selected?.constituents?.length ?? 1))}px`,
                }}
              >
                {sortedData.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelected(item)}
                    className={`w-full text-left px-4 py-3 border-b border-neutral-800/50 hover:bg-neutral-800/50 transition-colors ${
                      selected?.id === item.id ? "bg-amber-500/10 border-l-2 border-l-amber-500" : ""
                    }`}
                  >
                    <div className="flex justify-between items-center gap-2">
                      <p className="font-mono text-sm text-neutral-200 truncate">
                        {item.isin}
                      </p>
                      <span className="text-xs text-neutral-500 shrink-0">
                        {item.constituents?.length ?? 0} Konst.
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500 truncate mt-0.5">
                      {item.name}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Gewichtungs-Balken + Details */}
            <div className="lg:col-span-2 space-y-6">
              {selected && (
                <>
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6">
                    <h2 className="text-lg font-medium text-neutral-100 mb-1">
                      {selected.name}
                    </h2>
                    <p className="font-mono text-sm text-neutral-500 mb-4">
                      {selected.isin}
                    </p>
                    <div className="h-8 rounded-lg overflow-hidden flex">
                      {selected.constituents
                        .sort((a, b) => b.weight - a.weight)
                        .map((c, i) => (
                          <div
                            key={i}
                            className="transition-all"
                            style={{
                              width: `${c.weight}%`,
                              backgroundColor:
                                CHART_COLORS[i % CHART_COLORS.length],
                            }}
                            title={`${c.name} ${c.weight.toFixed(1)}%`}
                          />
                        ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 overflow-hidden">
                    <div className="px-5 py-3 border-b border-neutral-800 flex justify-between items-center">
                      <span className="text-sm text-neutral-400">
                        Konstituenten ({selected.constituents.length})
                      </span>
                      <span className="text-xs text-neutral-500">Kurs (USD)</span>
                    </div>
                    <ul className="divide-y divide-neutral-800">
                      {selected.constituents
                        .sort((a, b) => b.weight - a.weight)
                        .map((c, i) => {
                          const geckoId = COINGECKO_IDS[c.name];
                          const usd = geckoId ? prices[geckoId] : null;
                          return (
                            <li
                              key={i}
                              className="flex justify-between items-center gap-4 px-5 py-3 text-sm"
                            >
                              <span
                                className="w-3 h-3 rounded-full shrink-0"
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
                              <span className="text-amber-400 tabular-nums w-24 text-right shrink-0">
                                {usd != null
                                  ? `$${usd >= 1 ? usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : usd.toFixed(4)}`
                                  : ""}
                              </span>
                            </li>
                          );
                        })}
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
