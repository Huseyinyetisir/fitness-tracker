import { describe, expect, it } from 'vitest';
import { parseInRange } from './format';

describe('parseInRange', () => {
  it('holds back a partial value below the minimum', () => {
    expect(parseInRange('9', 15, 600)).toBeNull();
  });

  it('commits a value within range', () => {
    expect(parseInRange('90', 15, 600)).toBe(90);
    expect(parseInRange('120', 15, 600)).toBe(120);
  });

  it('holds back a value above the maximum', () => {
    expect(parseInRange('700', 15, 600)).toBeNull();
  });

  it('holds back blank text', () => {
    expect(parseInRange('', 15, 600)).toBeNull();
  });

  it('accepts a decimal comma', () => {
    expect(parseInRange('2,5', 0, 1000)).toBe(2.5);
  });

  it('holds back text that is not a number', () => {
    expect(parseInRange('abc', 0, 1000)).toBeNull();
  });
});
