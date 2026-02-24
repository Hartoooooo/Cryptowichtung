/**
 * PDF-Text-Extraktion mit pdf-parse, Fallback auf pdfjs-dist
 */

import { validateUrlForFetch } from "./allowlist";
import {
  MAX_PDF_SIZE_BYTES,
  FETCH_TIMEOUT_MS,
  USER_AGENT,
} from "./constants";

export async function downloadPdf(url: string): Promise<Buffer> {
  validateUrlForFetch(url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });

    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const contentLength = res.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_PDF_SIZE_BYTES) {
      throw new Error(`PDF zu groß (max ${MAX_PDF_SIZE_BYTES} Bytes)`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_PDF_SIZE_BYTES) {
      throw new Error(`PDF zu groß (${buf.length} Bytes)`);
    }

    return buf;
  } catch (e) {
    clearTimeout(timeout);
    if (e instanceof Error) throw e;
    throw new Error("Unbekannter Fehler beim PDF-Download");
  }
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(buffer);
    return data.text || "";
  } catch {
    return extractTextWithPdfjs(buffer);
  }
}

async function extractTextWithPdfjs(buffer: Buffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const numPages = pdf.numPages;
  const parts: string[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    parts.push(text);
  }

  return parts.join("\n");
}
