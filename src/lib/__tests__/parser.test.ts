import { parseFactsheetText } from "../parser";

describe("parseFactsheetText", () => {
  it("extrahiert As-of-Date und Konstituenten", () => {
    const text = `As of 15 January 2025
BTC 52.42%
Ethereum 24.60%
XRP 8.33%`;
    const result = parseFactsheetText(text);
    expect(result.asOfDate).toBe("15 January 2025");
    expect(result.constituents.length).toBeGreaterThanOrEqual(2);
    expect(result.constituents.length).toBe(3);
    expect(result.constituents[0].name).toBe("BTC");
    expect(result.constituents[0].weight).toBeGreaterThan(50);
  });

  it("extrahiert Gewichte mit Komma-Dezimaltrennzeichen", () => {
    const text = `Ethereum 24,60 %
    XRP 8,33%`;
    const result = parseFactsheetText(text);
    expect(result.constituents.some((c) => c.name === "Ethereum")).toBe(true);
    const eth = result.constituents.find((c) => c.name === "Ethereum");
    expect(eth?.weight).toBeCloseTo(24.6, 1);
  });

  it("filtert TER und andere Blacklist-Keywords", () => {
    const text = `TER 0.99%
    management fee 0.50%
    BTC 52.42%
    Ethereum 24.60%`;
    const result = parseFactsheetText(text);
    expect(result.constituents.some((c) => c.name.includes("TER"))).toBe(false);
    expect(result.constituents.some((c) => c.name.includes("management"))).toBe(
      false
    );
  });

  it("normalisiert Gewichtssumme auf 100", () => {
    const text = `BTC 50%
    ETH 30%
    XRP 20%`;
    const result = parseFactsheetText(text);
    const sum = result.constituents.reduce((s, c) => s + c.weight, 0);
    expect(sum).toBeCloseTo(100, 1);
  });

  it("erkennt Stand-Datum", () => {
    const text = `Stand 31.12.2024
    BTC 52.42%`;
    const result = parseFactsheetText(text);
    expect(result.asOfDate).toBe("31.12.2024");
  });

  it("erkennt Bitwise Single-Asset 100% – fully backed by ETH", () => {
    const text = `Bitwise Ethereum Staking ETP
The product is fully backed by ETH tokens held in professional cold-storage custody.`;
    const result = parseFactsheetText(text, "bitwise");
    expect(result.constituents).toHaveLength(1);
    expect(result.constituents[0].name).toBe("ETH");
    expect(result.constituents[0].weight).toBe(100);
  });

  it("erkennt Bitwise Single-Asset 100% – Staked Ethereum (ETH) 100%", () => {
    const text = `Zusammensetzung
Staked Ethereum (ETH) 100%`;
    const result = parseFactsheetText(text, "bitwise");
    expect(result.constituents).toHaveLength(1);
    expect(result.constituents[0].name).toBe("ETH");
    expect(result.constituents[0].weight).toBe(100);
  });

  it("erkennt Bitwise Physical XRP (GXRP) 100%", () => {
    const text = `The Bitwise Physical XRP ETP is fully backed by XRP held in cold-storage custody.`;
    const result = parseFactsheetText(text, "bitwise");
    expect(result.constituents).toHaveLength(1);
    expect(result.constituents[0].name).toBe("XRP");
    expect(result.constituents[0].weight).toBe(100);
  });

  it("erkennt Bitwise 100% XRP – Zusammensetzung Format", () => {
    const text = `Zusammensetzung
100% XRP`;
    const result = parseFactsheetText(text, "bitwise");
    expect(result.constituents).toHaveLength(1);
    expect(result.constituents[0].name).toBe("XRP");
    expect(result.constituents[0].weight).toBe(100);
  });

  it("erkennt CoinShares KID – Compass Crypto Reference Index Ethereum", () => {
    const text = `The product invests in the digital asset Compass Crypto Reference Index Ethereum, which is traded on various digital exchanges.`;
    const result = parseFactsheetText(text, "coinshares");
    expect(result.constituents).toHaveLength(1);
    expect(result.constituents[0].name).toBe("ETH");
    expect(result.constituents[0].weight).toBe(100);
  });

  it("ignoriert 100% fully (kein Krypto-Ticker)", () => {
    const text = `Physically allocated (100% fully backed)`;
    const result = parseFactsheetText(text, "bitwise");
    // Sollte nicht "fully" als Ticker extrahieren
    const hasFully = result.constituents.some((c) => c.name === "fully");
    expect(hasFully).toBe(false);
  });

  it("extrahiert Gold und andere Rohstoffe aus Bitwise Index-Zusammensetzung", () => {
    const text = `Index Composition / Zusammensetzung
Bitcoin (BTC) 70%
Gold 30%`;
    const result = parseFactsheetText(text, "bitwise");
    expect(result.constituents.some((c) => c.name.includes("BTC") || c.name === "BTC")).toBe(true);
    expect(result.constituents.some((c) => c.name === "Gold" || c.name.includes("Gold"))).toBe(true);
    const gold = result.constituents.find((c) => c.name.includes("Gold"));
    expect(gold?.weight).toBeCloseTo(30, 1);
  });
});
