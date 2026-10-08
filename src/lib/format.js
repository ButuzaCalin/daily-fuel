// iOS keyboards in comma locales type "," for decimals, which type="number" inputs reject; normalize to "." instead.
export function decimalInput(value) {
  const clean = value.replace(/,/g, '.').replace(/[^\d.]/g, '');
  const dot = clean.indexOf('.');
  return dot === -1 ? clean : clean.slice(0, dot + 1) + clean.slice(dot + 1).replace(/\./g, '');
}

export function niceStep(value) {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((factor) => factor * magnitude >= value);
  return step * magnitude;
}

export function chartNumber(value) {
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
}

export const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

export function compactNumber(value) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(Math.round(value));
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
