import { useCallback, useEffect, useRef, useState } from 'react';
import { extendRest, isStale, parseStoredTimer, remainingSeconds, startRest, type RestTimer } from './restTimer';

const STORAGE_KEY = 'fit-tracker.rest-timer';

function load(): RestTimer | null {
  try {
    return parseStoredTimer(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function save(timer: RestTimer | null): void {
  try {
    if (timer) localStorage.setItem(STORAGE_KEY, JSON.stringify(timer));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable: the timer still works until the page is left.
  }
}

export interface RestTimerControls {
  active: boolean;
  done: boolean;
  remaining: number;
  start: (seconds: number) => void;
  extend: (seconds: number) => void;
  stop: () => void;
}

/**
 * The rest timer counts from an absolute end time, never from ticks. Android
 * throttles timers while the screen is off, so a countdown that decremented
 * on each interval would drift or stall between sets. The end time is kept
 * in localStorage, so leaving the screen or reloading does not lose it.
 */
export function useRestTimer(vibrate: boolean): RestTimerControls {
  const [timer, setTimer] = useState<RestTimer | null>(() => {
    const stored = load();
    return stored && !isStale(stored, Date.now()) ? stored : null;
  });
  const [now, setNow] = useState(() => Date.now());
  // A timer restored after it already finished must not buzz again.
  const notifiedFor = useRef<number | null>(timer && timer.endsAt <= Date.now() ? timer.endsAt : null);

  useEffect(() => {
    if (!timer) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    const onVisible = () => setNow(Date.now());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [timer]);

  const remaining = timer ? remainingSeconds(timer, now) : 0;
  const done = timer !== null && remaining === 0;

  useEffect(() => {
    if (!timer || !done || notifiedFor.current === timer.endsAt) return;
    notifiedFor.current = timer.endsAt;
    if (vibrate && typeof navigator.vibrate === 'function') navigator.vibrate([300, 150, 300]);
  }, [timer, done, vibrate]);

  const start = useCallback((seconds: number) => {
    const next = startRest(Date.now(), seconds);
    save(next);
    setNow(Date.now());
    setTimer(next);
  }, []);

  const extend = useCallback((seconds: number) => {
    setTimer((current) => {
      if (!current) return current;
      const next = extendRest(current, seconds, Date.now());
      save(next);
      return next;
    });
    setNow(Date.now());
  }, []);

  const stop = useCallback(() => {
    save(null);
    setTimer(null);
  }, []);

  return { active: timer !== null, done, remaining, start, extend, stop };
}
