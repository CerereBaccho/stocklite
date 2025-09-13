// src/utils/time.ts
export const nowISO = (): string => new Date().toISOString();

export const mmdd = (iso?: string): string => {
  const d = iso ? new Date(iso) : new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}`;
};