# Musteranalyse – Intraday Pattern Detection

Die Musteranalyse ist eine Sektion auf der Seite **Auswertungen**, die auffällige Muster und Anomalien innerhalb eines einzelnen Handelstags erkennt, erklärt und mit Drilldown visualisiert.

## Voraussetzungen

- **1 Handelstag pro CSV**: Pro Import wird genau ein Handelstag analysiert.
- **CSV-Format**: Unterstützt werden sowohl das bestehende Auswertungs-Format (ISINCOD, BETRAG, ORDRBUYCOD, TRANDATTIM, …) als auch ein generisches Handelsformat (timestamp, symbol, side, qty, price, optional pnl, fees, tags, exchange, orderId).
- **Keine Breaking Changes**: Der bestehende Import und die Auswertungslogik bleiben unverändert.

## Unterstützte Insight-Typen

| Nr | Typ | Beschreibung |
|----|-----|--------------|
| 1 | Trade-Count-Spike | Ungewöhnlich viele Trades in einem Bucket (Z-Score/IQR) |
| 2 | Notional-Spike | Ungewöhnlich hohes Gesamt-Notional in einem Bucket |
| 3 | Burstiness | Mikro-Bursts (viele Trades in 1 Minute) |
| 4 | Quiet Period | Auffällig wenig Aktivität in sonst aktiven Phasen |
| 5 | Open/Close Konzentration | Überproportionaler Anteil in erster/letzter Stunde |
| 6 | Lunchtime-Anomalie | Abweichung im Mittagsband (12–14 Uhr) |
| 7 | Symbol Dominance Shift | Top-Symbol wechselt innerhalb des Tages |
| 8 | Notional Concentration | Ein Symbol dominiert das Tagesnotional |
| 9 | Flip-Flop | Schnelle Side-Wechsel (BUY→SELL→BUY) auf gleichem Symbol |
| 10 | Clone Trades | Viele Trades mit identischer qty oder ähnlichem Notional |
| 11 | Fee Churn | Hohe Fees relativ zu Notional + viele kleine Trades |
| 12 | Duplicate/Replay | Duplikate (timestamp+symbol+qty+price) |
| 13 | Loss Streak | Ungewöhnlich lange Verlustserie (bei PnL) |
| 14 | Post-Loss Escalation | Nach großem Verlust steigt die Frequenz (bei PnL) |
| 15 | Skew Pattern | Viele kleine Gewinne vs wenige große Verluste (bei PnL) |
| 16 | Timestamp Issues | Fehlende oder ungültige Timestamps |
| 17 | Missing Core Fields | Hohe Quote fehlender Kerndaten (Symbol, qty, price) |

## Severity & Confidence

- **Severity (0–100)**: Skaliert aus Abweichungsstärke und Impact (Anteil betroffener Trades/Notional).
- **Confidence (0–1)**: Abhängig von Datenmenge und Stabilität; niedriger bei wenigen Trades im Segment.

Jede Insight liefert:
- Erklärung (human-readable)
- Metriken (observed vs baseline, z-score, etc.)
- Betroffene Trades
- Export der betroffenen Trades als CSV

## UI

- **Heatmap**: Trades bzw. Notional pro Stunde (umschaltbar 1m/5m/15m/60m Buckets).
- **Top-5-Insights**: Nach Severity sortiert.
- **Insight Cards**: Klick öffnet Detail-Drawer mit Metriken, Regeln und Trades.
- **Filter**: Symbol, Side (Buy/Sell).
- **Export**: CSV der betroffenen Trades pro Insight.

## Technische Details

- **Ordnerstruktur**:
  - `src/lib/pattern-engine/`: Normalisierung, Baselines, Insights, Index
  - `src/components/musteranalyse/`: HeatmapChart, InsightCard, InsightDetailDrawer, MusteranalyseSection
- **Baselines**: Nur aus demselben Tag (Median, MAD, IQR).
- **Performance**: Pre-Aggregation, Memoization; für große Dateien (50k–500k Trades) optimiert.

## Zeitzone

- Timestamps werden in lokaler Browser-TZ interpretiert.
- Session-Phasen (Pre/Open/Mid/Close) basieren auf lokaler Zeit (8–10 Uhr Open, 16+ Uhr Close).
- Bei ISO/UNIX-Formaten wird die lokale TZ des Clients verwendet.
