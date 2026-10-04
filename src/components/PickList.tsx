export interface PickItem {
  id: string;
  label: string;
  detail?: string;
}

export default function PickList({
  items,
  onPick,
  empty = 'Nothing here yet.',
}: {
  items: PickItem[];
  onPick: (id: string) => void;
  empty?: string;
}) {
  if (items.length === 0) return <p className="py-4 text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
      {items.map((item) => (
        <li key={item.id}>
          <button type="button" onClick={() => onPick(item.id)} className="min-h-14 w-full px-4 py-2 text-left">
            <span className="block">{item.label}</span>
            {item.detail && <span className="block text-sm text-muted">{item.detail}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
