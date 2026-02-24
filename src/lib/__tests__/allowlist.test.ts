import { isUrlAllowed, validateUrlForFetch } from "../allowlist";

describe("isUrlAllowed", () => {
  it("erlaubt cdn.21shares.com", () => {
    expect(
      isUrlAllowed("https://cdn.21shares.com/uploads/current-documents/factsheets/all/Factsheet_HODL.pdf")
    ).toBe(true);
  });

  it("erlaubt 21shares.com", () => {
    expect(isUrlAllowed("https://21shares.com/en-ch/ir/factsheets")).toBe(true);
  });

  it("erlaubt www.21shares.com", () => {
    expect(isUrlAllowed("https://www.21shares.com/product")).toBe(true);
  });

  it("erlaubt vaneck.com", () => {
    expect(isUrlAllowed("https://www.vaneck.com/globalassets/factsheet.pdf")).toBe(true);
  });

  it("erlaubt etc-group.com", () => {
    expect(
      isUrlAllowed("https://etc-group.com/resources/fact_sheet/fact-sheet-bitwise-physical-bitcoin-etp.pdf")
    ).toBe(true);
  });

  it("erlaubt bitwiseinvestments.eu", () => {
    expect(isUrlAllowed("https://bitwiseinvestments.eu/resources/")).toBe(true);
  });

  it("erlaubt deutschedigitalassets.com", () => {
    expect(
      isUrlAllowed("https://deutschedigitalassets.com/wp-content/uploads/product_uploads/funds/etps/slct-dda-crypto-select-10-etp/Germany/Featured/slct-dda-crypto-select-10-etp_Factsheet-en.pdf")
    ).toBe(true);
  });

  it("erlaubt justetf.com für ISIN-Discovery", () => {
    expect(isUrlAllowed("https://www.justetf.com/en/etf-profile.html?isin=DE000A28M8D0")).toBe(
      true
    );
  });

  it("lehnt andere Domains ab", () => {
    expect(isUrlAllowed("https://example.com/file.pdf")).toBe(false);
    expect(isUrlAllowed("https://evil.com?url=https://cdn.21shares.com")).toBe(false);
  });

  it("lehnt http ab (nur https)", () => {
    expect(isUrlAllowed("http://cdn.21shares.com/file.pdf")).toBe(false);
  });
});

describe("validateUrlForFetch", () => {
  it("wirft bei nicht erlaubter URL", () => {
    expect(() => validateUrlForFetch("https://evil.com")).toThrow();
  });

  it("wirft nicht bei erlaubter URL", () => {
    expect(() =>
      validateUrlForFetch("https://cdn.21shares.com/factsheet.pdf")
    ).not.toThrow();
  });
});
