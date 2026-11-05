import { describe, expect, it } from "vitest";
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  formatCurrency,
  formatCurrencyShort,
} from "./currency";

describe("formatCurrency", () => {
  it("formats amounts with Brazilian centavos", () => {
    const out = formatCurrency(1234.5, "BRL").replace(/\s/g, "");
    expect(out).toMatch(/R\$1\.234,50/);
  });

  it("defaults to BRL when no currency is given", () => {
    expect(formatCurrency(10)).toBe(formatCurrency(10, DEFAULT_CURRENCY));
    expect(DEFAULT_CURRENCY).toBe("BRL");
  });

  it("treats an empty-string currency as the default", () => {
    expect(formatCurrency(10, "")).toBe(formatCurrency(10, DEFAULT_CURRENCY));
  });

  it("coerces non-finite values to 0", () => {
    expect(formatCurrency(Number.NaN, "USD")).toContain("0");
  });

  it("renders a well-formed but unknown ISO code without throwing", () => {
    // Intl is lenient here — it uses the code as the symbol.
    const out = formatCurrency(1234, "ZZZ");
    expect(out).toContain("ZZZ");
    expect(out.replace(/\s/g, "")).toMatch(/1[.,]234/);
  });

  it("never throws on a structurally invalid code (no DB CHECK on deals.currency)", () => {
    for (const bad of ["United States", "US", "USDD", "12", "u$d"]) {
      expect(() => formatCurrency(1234, bad)).not.toThrow();
      expect(formatCurrency(1234, bad).replace(/\s/g, "")).toMatch(/1[.,]234/);
    }
  });

  it("formats every offered currency without throwing", () => {
    for (const c of CURRENCIES) {
      expect(() => formatCurrency(1000, c.code)).not.toThrow();
    }
  });
});

describe("formatCurrencyShort", () => {
  it("abbreviates millions and thousands in Portuguese", () => {
    expect(formatCurrencyShort(2_500_000, "BRL").replace(/\s/g, "")).toBe("R$2,5mi");
    expect(formatCurrencyShort(3_400, "BRL").replace(/\s/g, "")).toBe("R$3,4mil");
  });

  it("uses the matching symbol for non-BRL currencies", () => {
    expect(formatCurrencyShort(1_000, "EUR").replace(/\s/g, "")).toBe("€1,0mil");
    expect(formatCurrencyShort(1_000, "INR").replace(/\s/g, "")).toBe("₹1,0mil");
  });

  it("falls back to the code prefix for unknown currencies (no throw)", () => {
    expect(formatCurrencyShort(1_000, "ZZZ").replace(/\s/g, "")).toContain("1,0mil");
  });
});
