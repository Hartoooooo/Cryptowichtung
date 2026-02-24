"use client";

import { useState, useCallback } from "react";
import * as XLSX from "xlsx";

interface ConstituentWeight {
  name: string;
  weight: number;
}

interface WeightsResult {
  isin: string;
  asOfDate: string | null;
  constituents: ConstituentWeight[];
  navUsd: number | null;
  sourcePdfUrl: string;
  cacheStatus: "HIT" | "MISS";
  fetchedAt: string;
}

interface ExcelRow {
  isin: string;
  name: string;
  result?: WeightsResult;
  error?: string;
  saved?: boolean;
  skipped?: boolean;
  updated?: boolean;
}

const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

function parseExcelFile(file: File): Promise<ExcelRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          reject(new Error("Datei konnte nicht gelesen werden"));
          return;
        }
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        const rows = raw as unknown[][];

        if (rows.length < 2) {
          resolve([]);
          return;
        }

        const headers = (rows[0] as string[]).map((h) =>
          String(h ?? "").toLowerCase().trim()
        );
        let colIsin = headers.findIndex(
          (h) => h === "isin" || h === "isin code" || h === "isbn" || h === "wertpapier"
        );
        // Vorrang: Instruments Short Name (z.B. Broker-Excel), dann Fallbacks
        let colName = headers.findIndex(
          (h) =>
            h === "instruments short name" ||
            h === "instruments_short_name" ||
            h === "instrument short name" ||
            h === "instrument_short_name" ||
            h === "instrumentshortname" ||
            h === "short name" ||
            h === "shortname"
        );
        if (colName < 0) {
          colName = headers.findIndex(
            (h) =>
              h === "name" ||
              h === "bezeichnung" ||
              h === "titel" ||
              h === "produkt" ||
              h === "wert"
          );
        }
        if (colIsin < 0) colIsin = 0;
        if (colName < 0) colName = colIsin === 0 ? 1 : 0;

        const out: ExcelRow[] = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i] as unknown[];
          const isinRaw = String(row[colIsin] ?? "").trim().toUpperCase().replace(/\s/g, "");
          const nameRaw = String(row[colName] ?? "").trim();
          if (!isinRaw && !nameRaw) continue;
          if (!ISIN_REGEX.test(isinRaw)) continue;
          out.push({
            isin: isinRaw,
            name: nameRaw || isinRaw,
          });
        }
        resolve(out);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden"));
    reader.readAsArrayBuffer(file);
  });
}

export default function Home() {
  const [error, setError] = useState<string | null>(null);

  const [rows, setRows] = useState<ExcelRow[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    if (
      !file.name.match(/\.(xlsx|xls)$/i) &&
      !file.type.match(/spreadsheet|excel/i)
    ) {
      setError("Bitte eine Excel-Datei (.xlsx oder .xls) hochladen.");
      return;
    }
    setError(null);
    try {
      const parsed = await parseExcelFile(file);
      setRows(parsed);
      if (parsed.length === 0) {
        setError("Keine gültigen Zeilen mit ISIN und Instruments Short Name gefunden.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Excel konnte nicht gelesen werden.");
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleVerifyAll = useCallback(async () => {
    if (rows.length === 0) return;
    setVerifyLoading(true);
    setError(null);

    const updated: ExcelRow[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = { ...rows[i] };
      if (!row.isin) {
        updated.push(row);
        continue;
      }
      try {
        const res = await fetch("/api/weights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isin: row.isin, productName: row.name }),
        });
        const data = await res.json();
        if (!res.ok) {
          row.error = data.error || "Fehler";
          updated.push(row);
          continue;
        }
        row.result = data;
        row.error = undefined;

        if (data.constituents && data.constituents.length > 0) {
          try {
            const saveRes = await fetch("/api/save-weight", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                isin: row.isin,
                name: row.name || row.isin,
                constituents: data.constituents,
              }),
            });
            const saveData = await saveRes.json();
            row.saved = saveRes.ok;
            row.skipped = saveData.skipped === true;
            row.updated = saveData.updated === true;
          } catch {
            row.saved = false;
          }
        }
      } catch {
        row.error = "Netzwerkfehler";
      }
      updated.push(row);
      setRows([...updated]);
    }
    setRows(updated);
    setVerifyLoading(false);
  }, [rows]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans antialiased">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-8">
          <h1 className="text-2xl tracking-tight text-neutral-100 mb-2">
            Gewichtung
          </h1>
          <p className="text-neutral-400 text-sm">
            Konstituenten-Gewichte aus Factsheet-PDFs (21Shares, VanEck, Bitwise, DDA)
          </p>
        </div>

        {/* Excel Drag & Drop */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`mb-8 rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
            dragOver
              ? "border-amber-500 bg-amber-500/5"
              : "border-neutral-700 hover:border-neutral-600"
          }`}
        >
          <p className="text-neutral-400 text-sm mb-2">
            Excel-Datei hierher ziehen oder per Klick öffnen
          </p>
          <p className="text-neutral-500 text-xs mb-4">
            Es werden Spalten „ISIN“ und „Instruments Short Name“ verwendet.
          </p>
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            id="excel-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          <label
            htmlFor="excel-input"
            className="inline-block rounded-xl bg-neutral-800 px-4 py-2 text-sm text-neutral-200 cursor-pointer hover:bg-neutral-700"
          >
            Datei auswählen
          </label>
          {rows.length > 0 && (
            <p className="mt-4 text-amber-400 text-sm">
              {rows.length} Zeile(n) geladen
            </p>
          )}
        </div>

        {/* Batch-Tabelle + Überprüfen */}
        {rows.length > 0 && (
          <div className="mb-8 rounded-2xl border border-neutral-800 bg-neutral-900/50 overflow-hidden">
            <div className="flex justify-between items-center px-5 py-3 border-b border-neutral-800 flex-wrap gap-2">
              <span className="text-sm text-neutral-400">
                {rows.length} Einträge
              </span>
              <div className="flex gap-2">
                {rows.some((r) => r.error) && (
                  <button
                    onClick={() => {
                      const failed = rows.filter((r) => r.error);
                      const wb = XLSX.utils.book_new();
                      const ws = XLSX.utils.json_to_sheet(
                        failed.map((r) => ({
                          "ISIN Code": r.isin,
                          "Instruments Short Name": r.name,
                          Fehler: r.error,
                        }))
                      );
                      XLSX.utils.book_append_sheet(wb, ws, "Fehlgeschlagen");
                      XLSX.writeFile(wb, "fehlgeschlagene-isins.xlsx");
                    }}
                    className="rounded-xl border border-red-500/50 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10"
                  >
                    Fehlgeschlagen herunterladen ({rows.filter((r) => r.error).length})
                  </button>
                )}
                <button
                  onClick={handleVerifyAll}
                  disabled={verifyLoading}
                  className="rounded-xl bg-amber-500 px-5 py-2 text-sm text-neutral-950 font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-amber-400"
                >
                  {verifyLoading ? "Prüfe…" : "Alle überprüfen"}
                </button>
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-neutral-900">
                  <tr className="text-left text-neutral-500 border-b border-neutral-800">
                    <th className="px-4 py-2">ISIN</th>
                    <th className="px-4 py-2">Instruments Short Name</th>
                    <th className="px-4 py-2 w-24">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={i}
                      className="border-b border-neutral-800/50 hover:bg-neutral-800/30"
                    >
                      <td className="px-4 py-2 font-mono text-neutral-200">
                        {row.isin || "—"}
                      </td>
                      <td className="px-4 py-2 text-neutral-300 truncate max-w-[200px]">
                        {row.name || "—"}
                      </td>
                      <td className="px-4 py-2">
                        {row.error && (
                          <span className="text-red-400 text-xs">{row.error}</span>
                        )}
                        {row.result && !row.error && (
                          <span className="text-amber-400 text-xs">
                            {row.result.constituents.length} Konst.
                            {row.saved && " ✓"}
                            {row.updated && " (Name aktualisiert)"}
                            {row.skipped && " (bereits vorhanden)"}
                          </span>
                        )}
                        {!row.result && !row.error && verifyLoading && (
                          <span className="text-neutral-500 text-xs">…</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300 text-sm"
          >
            {error}
          </div>
        )}

        {!error && rows.length === 0 && (
          <p className="text-neutral-500 text-sm">
            Excel-Datei per Drag & Drop einfügen. Beispiel:
            CH0445689208 (21Shares Crypto Basket Index ETP)
          </p>
        )}
      </div>
    </div>
  );
}
