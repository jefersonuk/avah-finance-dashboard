import { describe, expect, it } from "vitest";
import { parseFinancialCsv } from "./financial.js";

describe("parseFinancialCsv", () => {
  it("normaliza colunas e valores", () => {
    const csv = `ID do pedido,SKU,Nome do produto,Data de criação do pedido,Quantia total lançada,Preço do produto\nORD-1,SKU-1,Produto 1,15/01/2026,"R$ 120,50","R$ 120,50"`;

    const parsed = parseFinancialCsv(csv);

    expect(parsed.normalized_rows).toHaveLength(1);
    expect(parsed.normalized_rows[0].order_id).toBe("ORD-1");
    expect(parsed.normalized_rows[0].order_created_at).toBe("2026-01-15");
    expect(parsed.normalized_rows[0].total_amount).toBe(120.5);
  });
});
