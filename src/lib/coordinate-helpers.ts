export function normalizeCoordinate(value: string | number | undefined | null): number | undefined {
  if (value === undefined || value === null) return undefined;
  
  const stringValue = String(value).trim().replace(",", ".");
  const num = Number(stringValue);
  
  return isNaN(num) ? undefined : num;
}