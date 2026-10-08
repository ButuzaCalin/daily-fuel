export function formatWeight(value) {
  return (Math.round(value * 10) / 10).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function formatWeightChange(value) {
  const rounded = Math.round(value * 10) / 10;
  return rounded === 0 ? '±0.0' : `${rounded > 0 ? '+' : '−'}${formatWeight(Math.abs(rounded))}`;
}
