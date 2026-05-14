export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function parseDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function isWithinRange(date: string, start: string, end: string | null): boolean {
  const target = parseDate(date).getTime();
  const startMs = parseDate(start).getTime();
  const endMs = end ? parseDate(end).getTime() : Number.POSITIVE_INFINITY;
  return target >= startMs && target <= endMs;
}

export function monthFromDate(date: string): string {
  return date.slice(0, 7);
}

export function safeDivide(value: number, divisor: number): number | null {
  if (divisor === 0) {
    return null;
  }

  return value / divisor;
}

export function toMapSum<T extends string>(items: Array<{ key: T; value: number }>): Record<T, number> {
  const output = {} as Record<T, number>;

  for (const item of items) {
    output[item.key] = roundCurrency((output[item.key] ?? 0) + item.value);
  }

  return output;
}

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
