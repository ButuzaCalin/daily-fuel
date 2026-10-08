import { Sparkles } from 'lucide-react';
import { formatResetTime } from '../features/ai/proxy.js';

export function HeaderQuota({ quota }) {
  if (!quota) return null;
  const empty = quota.remaining === 0;
  const description = `${quota.remaining} of ${quota.limit} AI requests left today. Resets at ${formatResetTime(quota.resetsAt)}.`;
  return (
    <div className={`header-ai-quota${empty ? ' is-empty' : ''}`} role="status" aria-label={description} title={description}>
      <Sparkles aria-hidden="true" />
      <strong>{quota.remaining}</strong><span className="header-quota-label">left</span>
    </div>
  );
}
