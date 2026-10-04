import { useState } from 'react';
import Button from '../../components/Button';
import { Segmented, TextAreaField } from '../../components/Fields';
import { isWorkingSet } from '../../lib/strength';
import { removeSession } from './sessionsRepo';
import type { SessionView } from './sessionView';
import { suggestStatus, type FinishedStatus } from './setRules';
import { finishSession } from './setsRepo';

export default function FinishPanel({
  view,
  onCancel,
  onDone,
}: {
  view: SessionView;
  onCancel: () => void;
  onDone: () => void;
}) {
  const suggested = suggestStatus(
    view.blocks
      .filter((b) => b.exercise?.modality !== 'cardio')
      .map((b) => ({ targetSets: b.child.target_sets, workingSets: b.sets.filter(isWorkingSet).length })),
  );
  const current = view.session.status;
  const [status, setStatus] = useState<FinishedStatus>(current === 'planned' ? suggested : current);
  const [energy, setEnergy] = useState<number | null>(view.session.energy);
  const [notes, setNotes] = useState(view.session.notes ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await finishSession(view.session.id, { status, energy, notes: notes.trim() || null });
    onDone();
  }

  return (
    <div className="space-y-5 rounded-2xl border border-border bg-surface p-4">
      <h2 className="text-lg font-semibold">Finish session</h2>
      <Segmented<FinishedStatus>
        label="Status"
        value={status}
        options={[
          { value: 'done', label: 'Done' },
          { value: 'partial', label: 'Partial' },
          { value: 'skipped', label: 'Skipped' },
        ]}
        onChange={setStatus}
      />
      <div className="space-y-1">
        <p className="text-sm text-muted">Energy</p>
        <Segmented
          label="Energy, 1 to 5"
          value={energy === null ? '' : String(energy)}
          options={['1', '2', '3', '4', '5'].map((v) => ({ value: v, label: v }))}
          onChange={(v) => setEnergy(Number(v))}
        />
      </div>
      <TextAreaField label="Session notes" value={notes} onChange={setNotes} />
      <div className="grid grid-cols-[1fr_2fr] gap-2">
        <Button onClick={onCancel}>Back</Button>
        <Button variant="primary" disabled={saving} onClick={() => void save()}>
          Save
        </Button>
      </div>
      <Button
        variant="danger"
        block
        onClick={async () => {
          if (!window.confirm('Delete this session and everything logged in it?')) return;
          await removeSession(view.session.id);
          onDone();
        }}
      >
        Delete session
      </Button>
    </div>
  );
}
