import { useRef, useState } from 'react';
import { toBlob } from 'html-to-image';
import { ChevronLeft, ChevronRight, Clock, LoaderCircle, Share2 } from 'lucide-react';
import { scoreTone } from './DayScore.jsx';
import { SharePoster } from './SharePoster.jsx';
import { scoreForDay } from './history.js';
import { DAY_COMPLETE_HOUR, dayStatus, scoreLabel } from './score.js';
import { useNow } from '../../hooks/useNow.js';
import { dateKey } from '../../lib/date.js';

// Month grid (Monday first) with each completed day's score; tapping a day opens it.
export function ScoreCalendar({ goal, mealsByDate, onOpenDay, notify }) {
  const posterRef = useRef(null);
  const now = useNow(true);
  const todayKey = dateKey(now);
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [sharing, setSharing] = useState(false);
  const isCurrentMonth = month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const leading = (month.getDay() + 6) % 7;
  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const date = dateKey(new Date(month.getFullYear(), month.getMonth(), index + 1));
    return { date, day: index + 1, score: scoreForDay(date, mealsByDate, goal, todayKey, now), isToday: date === todayKey, inProgress: dayStatus(date, todayKey, now) === 'in-progress' };
  });
  const scores = days.filter((day) => day.score !== null).map((day) => day.score);
  const average = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null;
  const shiftMonth = (amount) => setMonth(new Date(month.getFullYear(), month.getMonth() + amount, 1));

  async function shareCalendar() {
    if (!posterRef.current || sharing) return;
    setSharing(true);
    try {
      const blob = await toBlob(posterRef.current, { width: 1080, height: 1920, pixelRatio: 1 });
      if (!blob) throw new Error('Could not create the calendar image.');
      const filename = `daily-fuel-scores-${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}.png`;
      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        notify('Calendar image downloaded.', 'success');
      }
    } catch (error) {
      if (error.name !== 'AbortError') notify(error.message || 'Could not share the calendar image.');
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="chart-card score-calendar">
      <div className="share-poster-stage" aria-hidden="true"><SharePoster ref={posterRef} month={month} days={days} leading={leading} scores={scores} average={average} /></div>
      <div className="card-heading scores-card-heading">
        <div><h2>Daily score</h2><span>{average === null ? 'No scored days' : `avg ${average} · ${scores.length} ${scores.length === 1 ? 'day' : 'days'}`}</span></div>
        <button className="calendar-share-button" type="button" onClick={shareCalendar} disabled={sharing} aria-label="Share scores calendar">
          {sharing ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Share2 aria-hidden="true" />}
          {sharing ? 'Creating…' : 'Share'}
        </button>
      </div>
      <div className="calendar-nav">
        <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month"><ChevronLeft /></button>
        <strong>{new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(month)}</strong>
        <button type="button" onClick={() => shiftMonth(1)} disabled={isCurrentMonth} aria-label="Next month"><ChevronRight /></button>
      </div>
      <div className="calendar-grid">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, index) => <span className="calendar-weekday" key={index}>{label}</span>)}
        {Array.from({ length: leading }, (_, index) => <span key={`blank-${index}`} />)}
        {days.map((day) => (
          <button className={`calendar-day${day.score !== null ? ` day-score-${scoreTone(day.score)}` : ''}${day.isToday ? ' is-today' : ''}${day.inProgress ? ' is-in-progress' : ''}`} type="button" disabled={day.date > todayKey} onClick={() => onOpenDay(day.date)} title={day.inProgress ? `Today's score is available after ${DAY_COMPLETE_HOUR}:00` : day.score !== null ? `${day.date}: ${day.score}/100 · ${scoreLabel(day.score)}` : day.date} aria-label={day.inProgress ? `${day.date}: score available after ${DAY_COMPLETE_HOUR}:00` : undefined} key={day.date}>
            <small className="calendar-day-date">{day.day}</small>
            <strong>{day.inProgress ? <Clock className="calendar-pending-icon" aria-hidden="true" /> : day.score ?? ''}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}
