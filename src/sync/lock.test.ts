import { describe, expect, it } from 'vitest';
import { SyncLock } from './lock';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe('SyncLock', () => {
  it('runs tasks one at a time, in order', async () => {
    const lock = new SyncLock();
    const order: string[] = [];
    const gate = deferred();

    const first = lock.run(async () => {
      order.push('first start');
      await gate.promise;
      order.push('first end');
    });
    const second = lock.run(async () => {
      order.push('second');
    });

    await Promise.resolve();
    expect(order).toEqual(['first start']);
    gate.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(['first start', 'first end', 'second']);
  });

  it('is busy from the moment a task is queued until the last one finishes', async () => {
    const lock = new SyncLock();
    expect(lock.busy).toBe(false);
    const gate = deferred();
    const task = lock.run(() => gate.promise);
    expect(lock.busy).toBe(true);
    gate.resolve();
    await task;
    expect(lock.busy).toBe(false);
  });

  it('returns the task result and passes errors through without jamming the queue', async () => {
    const lock = new SyncLock();
    await expect(lock.run(async () => 42)).resolves.toBe(42);
    await expect(lock.run(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(lock.busy).toBe(false);
    await expect(lock.run(async () => 'still works')).resolves.toBe('still works');
  });
});
