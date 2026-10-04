const STYLES: Record<string, string> = {
  planned: 'bg-accent/15 text-accent',
  done: 'bg-green-500/15 text-green-400',
  partial: 'bg-amber-500/15 text-amber-300',
  unfinished: 'bg-amber-500/15 text-amber-300',
  skipped: 'bg-zinc-500/20 text-zinc-300',
  missed: 'bg-red-500/15 text-red-300',
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[status] ?? 'bg-surface'}`}>
      {status}
    </span>
  );
}
