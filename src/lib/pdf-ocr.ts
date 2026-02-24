/**
 * OCR-Fallback: findet die Seite mit "ASSET ALLOCATION", rendert nur diese
 * als Bild (per @napi-rs/canvas + pdfjs-dist) und extrahiert Text per Tesseract.
 * Wird verwendet, wenn Textextraktion und die Holdings-API keine Konstituenten liefern.
 */

import { parseFactsheetText } from "./parser";
import type { ConstituentWeight } from "./parser";

const RENDER_SCALE = 3;

const SECTION_MARKERS = [
  "ASSET ALLOCATION",
  "Asset Allocation",
  "INDEX COMPOSITION",
  "Index Composition",
];

async function findAllocationPage(
  pdfjs: Awaited<typeof import("pdfjs-dist")>,
  buffer: Buffer
): Promise<number | null> {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((x) => ("str" in x ? x.str : "")).join(" ");
    if (SECTION_MARKERS.some((m) => text.includes(m))) {
      return i;
    }
  }
  return null;
}

export async function extractTextViaOcr(
  buffer: Buffer
): Promise<{ text: string; constituents: ConstituentWeight[] }> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const pdfjs = await import("pdfjs-dist");
  const { createWorker } = await import("tesseract.js");

  const targetPage = await findAllocationPage(pdfjs, buffer);
  if (targetPage === null) {
    return { text: "", constituents: [] };
  }

  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const page = await pdf.getPage(targetPage);
  const viewport = page.getViewport({ scale: RENDER_SCALE });

  const canvas = createCanvas(viewport.width, viewport.height);
  const context = canvas.getContext("2d");

  await page.render({
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise;

  const imgBuffer = await canvas.encode("png");

  const worker = await createWorker("eng", 1, { logger: () => {} });
  let text = "";
  try {
    const { data } = await worker.recognize(imgBuffer);
    text = data.text ?? "";
  } finally {
    await worker.terminate();
  }

  const { constituents } = parseFactsheetText(text);
  return { text, constituents };
}
