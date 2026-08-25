import { describe, expect, it } from "vitest";
import { formatPeso } from "../src/utils/format";

describe("money as a rider or customer reads it", () => {
  it("drops the centavos from a whole-peso fare", () => {
    // The delivery fee is charged in whole pesos, so ".00" says nothing.
    expect(formatPeso(205)).toBe("₱205");
    expect(formatPeso(67)).toBe("₱67");
  });

  it("keeps the centavos on item money, which is not whole", () => {
    // A receipt reads 994.50 and must not be shown as 994 or 995.
    expect(formatPeso(994.5)).toBe("₱994.50");
    expect(formatPeso(0.05)).toBe("₱0.05");
  });

  it("shows zero as a plain zero", () => {
    expect(formatPeso(0)).toBe("₱0");
  });

  it("rounds to the nearest centavo rather than truncating", () => {
    expect(formatPeso(1234.567)).toBe("₱1,234.57");
    expect(formatPeso(1234.564)).toBe("₱1,234.56");
  });

  it("treats a value that rounds up to whole as whole", () => {
    // 204.999 is 205.00 to the centavo, and ".00" is what we are removing.
    expect(formatPeso(204.999)).toBe("₱205");
  });

  it("groups thousands so a large basket stays readable", () => {
    expect(formatPeso(5000)).toBe("₱5,000");
    expect(formatPeso(99999.99)).toBe("₱99,999.99");
    expect(formatPeso(1000000)).toBe("₱1,000,000");
  });

  it("puts the sign outside the peso symbol", () => {
    // Not currently reachable for a fee, but a settlement shortfall is signed.
    expect(formatPeso(-50)).toBe("-₱50");
    expect(formatPeso(-12.34)).toBe("-₱12.34");
  });

  it("never renders NaN or Infinity at a customer", () => {
    expect(formatPeso(NaN)).toBe("₱0");
    expect(formatPeso(Infinity)).toBe("₱0");
    expect(formatPeso(undefined as unknown as number)).toBe("₱0");
  });
});
