/**
 * Serialises sync with the operations that must never interleave with it:
 * deleting all data, restoring a backup, signing out. A sync pushing rows
 * while the account is being wiped would put them straight back.
 *
 * `busy` is synchronous and becomes true the moment a task is queued, so two
 * triggers in the same tick cannot both start a sync — the same reason the
 * old guard was a ref and not React state.
 */
export class SyncLock {
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;

  get busy(): boolean {
    return this.pending > 0;
  }

  run<T>(task: () => Promise<T>): Promise<T> {
    this.pending++;
    const result = this.tail.then(async () => {
      try {
        return await task();
      } finally {
        this.pending--;
      }
    });
    // The next task waits for this one whether it succeeds or fails.
    this.tail = result.catch(() => undefined);
    return result;
  }
}
