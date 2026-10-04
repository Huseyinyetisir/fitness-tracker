import { useRef, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { useSingleFlight } from '../../app/useSingleFlight';
import Button from '../../components/Button';
import ConfirmPhrase from '../../components/ConfirmPhrase';
import { formatDateLong, formatNumber } from '../../lib/format';
import { today, toISODate } from '../../lib/time';
import { saveTextFile } from '../../platform/files';
import { supabaseSyncClient } from '../../sync/supabaseSyncClient';
import { wipeAccount } from '../../sync/wipe';
import { backupFileName, backupRowCount, buildBackup, parseBackup, type Backup } from './backup';
import { CSV_EXPORTS, csvFileName, loadCsvSources } from './csv';
import { forAccount, importBackup, type ImportResult } from './restore';

type ImportState =
  | { step: 'idle' }
  | { step: 'ready'; backup: Backup; sameAccount: boolean }
  | { step: 'message'; text: string; error?: boolean };

function describeImport(r: ImportResult): string {
  return `Imported: ${r.added} added, ${r.updated} updated, ${r.unchanged} already up to date.`;
}

export default function DataSection() {
  const { userId, exclusive, requestSync } = useApp();
  const { busy, run } = useSingleFlight();
  const [state, setState] = useState<ImportState>({ step: 'idle' });
  const fileInput = useRef<HTMLInputElement>(null);

  function attempt(action: () => Promise<string | void>) {
    return run(async () => {
      try {
        const text = await action();
        if (text) setState({ step: 'message', text });
      } catch (e) {
        setState({ step: 'message', text: e instanceof Error ? e.message : String(e), error: true });
      }
    });
  }

  async function pickFile(file: File | undefined) {
    if (!file) return;
    const parsed = parseBackup(await file.text());
    if (fileInput.current) fileInput.current.value = '';
    setState(
      parsed.ok
        ? { step: 'ready', backup: parsed.backup, sameAccount: parsed.backup.user_id === userId }
        : { step: 'message', text: parsed.error, error: true },
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-medium">Backup and export</h2>
      <p className="text-sm text-muted">
        A backup is a complete copy of your data that you keep, independent of the server. Free Supabase projects pause
        after about a week without use, so keep a recent one.
      </p>

      <Button
        variant="primary"
        block
        disabled={busy}
        onClick={() =>
          void attempt(async () => {
            const backup = await buildBackup(userId);
            const saved = await saveTextFile(backupFileName(today()), JSON.stringify(backup), 'application/json');
            return saved ? `Backup ready: ${formatNumber(backupRowCount(backup))} rows.` : undefined;
          })
        }
      >
        Export backup (JSON)
      </Button>

      <div>
        <p className="mb-1 text-sm text-muted">Spreadsheet (CSV)</p>
        <div className="grid grid-cols-3 gap-2">
          {CSV_EXPORTS.map((x) => (
            <Button
              key={x.key}
              disabled={busy}
              onClick={() =>
                void attempt(async () => {
                  await saveTextFile(csvFileName(x.key, today()), x.build(await loadCsvSources()), 'text/csv');
                })
              }
            >
              {x.label}
            </Button>
          ))}
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => void pickFile(e.target.files?.[0])}
      />
      <Button block disabled={busy} onClick={() => fileInput.current?.click()}>
        Import backup…
      </Button>

      {state.step === 'ready' && state.sameAccount && (
        <div className="space-y-3 rounded-xl border border-border p-3 text-sm">
          <p>
            Backup from {formatDateLong(toISODate(new Date(state.backup.exported_at)))} with{' '}
            {formatNumber(backupRowCount(state.backup))} rows. Merging keeps whichever copy of each row was changed
            last, so nothing you have edited since is overwritten.
          </p>
          <div className="grid grid-cols-[1fr_2fr] gap-2">
            <Button disabled={busy} onClick={() => setState({ step: 'idle' })}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() =>
                void attempt(async () => {
                  const result = await exclusive(() => importBackup(state.backup));
                  requestSync();
                  return describeImport(result);
                })
              }
            >
              Merge into this account
            </Button>
          </div>
        </div>
      )}

      {state.step === 'ready' && !state.sameAccount && (
        <ConfirmPhrase
          phrase="RESTORE"
          action="Replace with backup"
          busy={busy}
          onCancel={() => setState({ step: 'idle' })}
          onConfirm={() =>
            void attempt(async () => {
              if (!navigator.onLine) throw new Error('You are offline. Restoring needs a connection.');
              const result = await exclusive(async () => {
                await wipeAccount(supabaseSyncClient, userId);
                return importBackup(forAccount(state.backup, userId, today()));
              });
              requestSync();
              return `Restored. ${describeImport(result)}`;
            })
          }
        >
          <p className="mb-2">
            This backup is from a different account, made{' '}
            {formatDateLong(toISODate(new Date(state.backup.exported_at)))}.
          </p>
          <p>
            Restoring it <strong>replaces everything in this account</strong>, on the server and on this device, with
            the backup's {formatNumber(backupRowCount(state.backup))} rows. Needs a connection.
          </p>
        </ConfirmPhrase>
      )}

      {state.step === 'message' && (
        <p role="status" className={`text-sm ${state.error ? 'text-red-400' : 'text-muted'}`}>
          {state.text}
        </p>
      )}
    </div>
  );
}
