import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const symbols = req.nextUrl.searchParams.get("symbols");
  if (!symbols) {
    return NextResponse.json({ error: "symbols parameter required" }, { status: 400 });
  }

  const apiKey = process.env.COINMARKETCAP_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "CoinMarketCap API key not configured" }, { status: 500 });
  }

  try {
    const url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${encodeURIComponent(symbols)}&convert=USD`;
    const res = await fetch(url, {
      headers: {
        "X-CMC_PRO_API_KEY": apiKey,
        Accept: "application/json",
      },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `CoinMarketCap error: ${res.status}`, detail: text }, { status: 502 });
    }

    const data = await res.json();

    // Flatten to { SYMBOL: priceUSD }
    const prices: Record<string, number> = {};
    if (data?.data) {
      for (const [symbol, entry] of Object.entries(data.data)) {
        const e = entry as { quote?: { USD?: { price?: number } } };
        const price = e?.quote?.USD?.price;
        if (typeof price === "number") {
          prices[symbol.toUpperCase()] = price;
        }
      }
    }

    return NextResponse.json(prices);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Fetch failed" },
      { status: 500 }
    );
  }
}
