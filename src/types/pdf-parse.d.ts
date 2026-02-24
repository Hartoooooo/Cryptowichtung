declare module "pdf-parse" {
  interface PdfData {
    numpages: number;
    numrender: number;
    info: unknown;
    metadata: unknown;
    text: string;
    version: string;
  }
  function pdfParse(
    dataBuffer: Buffer,
    options?: Record<string, unknown>
  ): Promise<PdfData>;
  export default pdfParse;
}
