# Coinwichtung

Production-ready Webapp zur automatischen Ermittlung von Konstituenten-Gewichten für 21Shares-ETPs aus offiziellen Factsheet-PDFs.

## Voraussetzungen

- Node.js 18+
- npm

## Setup

1. Abhängigkeiten installieren:

```bash
npm install
```

2. Umgebungsvariablen (`.env`):

```
# Supabase PostgreSQL (für Prisma: IsinCache, FetchLog)
DATABASE_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true"

# Supabase (für weight_results)
NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="..."
```

Connection string aus Supabase: Project Settings → Database → Connection string (URI, Transaction pooler).

3. Supabase-Tabellen anlegen:

- `weight_results`: `supabase-migration.sql` im Supabase SQL Editor ausführen
- `IsinCache`/`FetchLog`: Prisma-Migration ausführen (nachdem DATABASE_URL gesetzt ist):

```bash
npx prisma migrate deploy
```

4. Entwicklungsserver starten:

```bash
npm run dev
```

Die App läuft unter [http://localhost:3000](http://localhost:3000).

## Verwendung

1. ISIN eingeben (z.B. `CH0454664001` für 21Shares Bitcoin ETP oder `CH0445689208` für Crypto Basket Index)
2. Auf "Abrufen" klicken
3. Ergebnisse anzeigen: Stichtag, Konstituenten mit Gewichten, Cache-Status, Factsheet-URL

## API

### POST /api/weights

Body: `{ "isin": "CH0445689208" }`

Liefert die geparsten Gewichte, `asOfDate`, `sourcePdfUrl`, `cacheStatus` (HIT/MISS), `fetchedAt`.

### GET /api/health

Prüft DB-Verbindung und liefert Status.

## Discovery (Crawling)

Für unbekannte ISINs wird automatisch das offizielle Product-List-PDF von cdn.21shares.com geladen und die Factsheet-URL ermittelt. Kein manuelles Mapping erforderlich.

## Mapping (optional)

Überschreiben oder Vorab-Konfiguration in `src/data/isin-mapping.json`:

```json
{
  "CH0445689208": {
    "productPageUrl": "https://21shares.com/en-ch/product/hodl",
    "factsheetUrl": "https://cdn.21shares.com/uploads/current-documents/factsheets/all/Factsheet_HODL.pdf"
  }
}
```

Mindestens `factsheetUrl` oder `productPageUrl` erforderlich.

## Tests

```bash
npm test
```

## OCR-Fallback für Balkendiagramme

Wenn die Asset Allocation nur als Balkendiagramm (Grafik) vorliegt, wird automatisch ein OCR-Fallback ausgeführt: PDF-Seiten werden gerendert, per Tesseract analysiert und der Text nach Gewichten durchsucht. Dafür werden `canvas` und `tesseract.js` benötigt. Die OCR-Ergebnisse werden nur übernommen, wenn die Gewichtssumme plausibel (90–110%) ist.

## Lizenz

Privat / Projektintern.
