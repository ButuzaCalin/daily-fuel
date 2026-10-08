export function formatUsageDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString();
}

const usageRetentionMs = 7 * 24 * 60 * 60 * 1000;

export function pruneUsage(value) {
  const cutoff = Date.now() - usageRetentionMs;
  const records = (value?.records || value?.recent || []).filter((item) => {
    const createdAt = new Date(item.created_at).getTime();
    return Number.isFinite(createdAt) && createdAt >= cutoff;
  });
  const dailyByDate = records.reduce((result, item) => {
    const date = item.created_at.slice(0, 10);
    const current = result[date] || { date, tokens: 0, requests: 0 };
    current.tokens += Number(item.total_tokens) || 0;
    current.requests += 1;
    result[date] = current;
    return result;
  }, {});
  const summary = records.reduce((result, item) => ({
    requests: result.requests + 1,
    prompt_tokens: result.prompt_tokens + (Number(item.prompt_tokens) || 0),
    completion_tokens: result.completion_tokens + (Number(item.completion_tokens) || 0),
    total_tokens: result.total_tokens + (Number(item.total_tokens) || 0),
  }), { requests: 0, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 });
  return { records, recent: records.slice(0, 20), daily: Object.values(dailyByDate).sort((first, second) => second.date.localeCompare(first.date)), summary };
}

export function recordUsage(current, item) {
  return pruneUsage({ ...current, records: [item, ...(current.records || current.recent || [])] });
}
