import { Clock } from 'lucide-react';
import { calculateScore, DAY_COMPLETE_HOUR, scoreLabel } from './score.js';

// Small score badge next to the AI button; the score stays hidden until the day is complete.
export function DayScore({ total, goal, meals, status, onOpen }) {
  if (status === 'future') return null;
  const score = status === 'complete' && meals.length ? calculateScore(total, goal).score : null;
  const caption = score !== null ? `${score}/100 · ${scoreLabel(score)}` : status === 'in-progress' ? `Score ready at ${DAY_COMPLETE_HOUR}:00` : meals.length ? 'No values yet' : 'No meals logged';
  return (
    <button className={`day-score${score !== null ? ` day-score-${scoreTone(score)}` : ''}`} type="button" onClick={onOpen} aria-label={`Daily score: ${caption}. Show details`} title={caption}>
      {score !== null ? score : status === 'in-progress' ? <Clock aria-hidden="true" /> : '—'}
    </button>
  );
}

export function scoreTone(score) {
  return score >= 90 ? 'great' : score >= 70 ? 'good' : score >= 60 ? 'fair' : 'low';
}
