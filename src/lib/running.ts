/** Seconds per kilometre. Returns 0 rather than Infinity for zero distance. */
export function paceSecondsPerKm(durationS: number, distanceKm: number): number {
  if (distanceKm <= 0 || durationS <= 0) return 0;
  return durationS / distanceKm;
}

/** 'm:ss'. Rounds to the nearest second, so 59.6s rolls into the next minute. */
export function formatPace(secPerKm: number): string {
  if (secPerKm <= 0) return '—';
  const total = Math.round(secPerKm);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 'm:ss' under an hour, 'h:mm:ss' at or above. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}
