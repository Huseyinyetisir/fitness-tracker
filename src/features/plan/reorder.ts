export interface Positioned {
  id: string;
  position: number;
}

/** Contiguous positions 0..n-1 in the given order; returns only the rows that changed. */
export function renumber(ordered: Positioned[]): Positioned[] {
  return ordered
    .map((item, index) => ({ id: item.id, position: index, was: item.position }))
    .filter((p) => p.position !== p.was)
    .map(({ id, position }) => ({ id, position }));
}

/** Swaps an item with its neighbour above (-1) or below (+1). Returns only changed rows. */
export function moveItem(items: Positioned[], id: string, delta: -1 | 1): Positioned[] {
  const ordered = [...items].sort((a, b) => a.position - b.position);
  const from = ordered.findIndex((i) => i.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ordered.length) return [];
  [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
  return renumber(ordered);
}
