import { formatUsageDate } from '../ai/usage.js';
import { ReportStat } from '../reports/ReportStat.jsx';

export function TokensPanel({ usage }) {
  const daily = usage?.daily || [];
  const maxDaily = Math.max(...daily.map((day) => day.tokens), 1);
  if (!usage) return null;
  return <>
    <section className="report-summary-grid usage-summary">
      <ReportStat label="Total tokens" value={usage.summary.total_tokens} />
      <ReportStat label="Requests" value={usage.summary.requests} />
      <ReportStat label="Output tokens" value={usage.summary.completion_tokens} />
    </section>
    <section className="chart-card usage-chart-card">
      <div className="card-heading"><h2>Daily usage</h2><span>last 7 days</span></div>
      {daily.length === 0 ? <p className="usage-empty">No estimates yet.</p> : <div className="usage-bars">{daily.slice().reverse().map((day) => <div className="usage-bar-column" key={day.date} title={`${day.date}: ${day.tokens.toLocaleString()} tokens`}><i style={{ height: `${Math.max((day.tokens / maxDaily) * 100, 4)}%` }} /><span>{day.date.slice(5)}</span></div>)}</div>}
    </section>
    <section className="chart-card recent-usage"><div className="card-heading"><h2>Recent requests</h2><span>model / tokens</span></div>{usage.recent.length === 0 ? <p className="usage-empty">No requests yet.</p> : <div className="usage-list">{usage.recent.map((item, index) => <div className="usage-row" key={`${item.created_at}-${index}`}><span>{item.model}</span><strong>{item.total_tokens.toLocaleString()}</strong><small>{formatUsageDate(item.created_at)}</small></div>)}</div>}</section>
  </>;
}
