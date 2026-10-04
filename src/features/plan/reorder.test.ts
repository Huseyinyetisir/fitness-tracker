import { describe, it, expect } from 'vitest';
import { moveItem, renumber } from './reorder';

const abc = [
  { id: 'a', position: 0 },
  { id: 'b', position: 1 },
  { id: 'c', position: 2 },
];

describe('moveItem', () => {
  it('moves an item up, returning only the rows that changed', () => {
    expect(moveItem(abc, 'b', -1)).toEqual([
      { id: 'b', position: 0 },
      { id: 'a', position: 1 },
    ]);
  });

  it('moves an item down', () => {
    expect(moveItem(abc, 'b', 1)).toEqual([
      { id: 'c', position: 1 },
      { id: 'b', position: 2 },
    ]);
  });

  it('does nothing at the top or bottom edge', () => {
    expect(moveItem(abc, 'a', -1)).toEqual([]);
    expect(moveItem(abc, 'c', 1)).toEqual([]);
  });

  it('does nothing for an unknown id', () => {
    expect(moveItem(abc, 'z', 1)).toEqual([]);
  });

  it('orders by position, not by array order', () => {
    const shuffled = [abc[2], abc[0], abc[1]];
    expect(moveItem(shuffled, 'c', -1)).toEqual([
      { id: 'c', position: 1 },
      { id: 'b', position: 2 },
    ]);
  });
});

describe('renumber', () => {
  it('closes gaps left by a removal', () => {
    expect(
      renumber([
        { id: 'a', position: 0 },
        { id: 'b', position: 2 },
        { id: 'c', position: 5 },
      ]),
    ).toEqual([
      { id: 'b', position: 1 },
      { id: 'c', position: 2 },
    ]);
  });

  it('returns nothing when positions are already contiguous', () => {
    expect(renumber(abc)).toEqual([]);
  });
});
