export function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function normalizeNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value !== "string") {
    return 0;
  }

  let cleaned = value.trim().replace(/R\$/gi, "").replace(/\s+/g, "");

  const hasDot = cleaned.includes(".");
  const hasComma = cleaned.includes(",");
  const dotAsThousandsOnly = /^-?\d{1,3}(\.\d{3})+$/.test(cleaned);

  if (hasDot && hasComma) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (dotAsThousandsOnly) {
    cleaned = cleaned.replace(/\./g, "");
  } else if (!hasDot && hasComma) {
    cleaned = cleaned.replace(",", ".");
  }

  const result = Number.parseFloat(cleaned);
  return Number.isFinite(result) ? result : 0;
}

export function normalizeDate(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "";
  }

  const raw = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [day, month, year] = raw.split("/");
    return `${year}-${month}-${day}`;
  }

  if (/^\d{2}-\d{2}-\d{4}$/.test(raw)) {
    const [day, month, year] = raw.split("-");
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return "";
}
