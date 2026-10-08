import { loadLocal, saveLocal } from '../../lib/storage.js';

const LAST_BACKUP_KEY = 'daily-fuel-last-backup';
const LAST_REMINDER_KEY = 'daily-fuel-backup-reminded';
const BACKUP_INTERVAL_DAYS = 14;
const REMIND_EVERY_DAYS = 3;
const dayMs = 24 * 60 * 60 * 1000;

const daysSince = (time) => Math.floor((Date.now() - time) / dayMs);

export function lastBackupAt() {
  return loadLocal(LAST_BACKUP_KEY, 0);
}

export function markBackedUp() {
  saveLocal(LAST_BACKUP_KEY, Date.now());
}

export function backupAgeLabel(time) {
  if (!time) return 'Never backed up';
  const days = daysSince(time);
  if (days === 0) return 'Last backup today';
  return `Last backup ${days === 1 ? 'yesterday' : `${days} days ago`}`;
}

// Data only lives on this device, so nudge for a backup once it is overdue (or never made and the
// oldest entry is that old), at most once every few days. Returns the reminder text, or null.
export function takeBackupReminder(oldestDate) {
  const last = lastBackupAt();
  const since = last ? daysSince(last) : oldestDate ? daysSince(new Date(`${oldestDate}T12:00:00`).getTime()) : 0;
  if (since < BACKUP_INTERVAL_DAYS) return null;
  const reminded = loadLocal(LAST_REMINDER_KEY, 0);
  if (reminded && daysSince(reminded) < REMIND_EVERY_DAYS) return null;
  saveLocal(LAST_REMINDER_KEY, Date.now());
  return last ? `Your last backup was ${since} days ago.` : 'Your data is only stored on this device. Export a backup to keep it safe.';
}
