import { formatAmount, LABELS } from '@ledgerly/money';

const METHOD_NAMES = {
  ocr: 'Local OCR',
  claude: 'AI (Claude)',
  mock: 'Demo values',
  manual: 'Typed',
};

export function formatWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// A list of saved invoices, newest first. `onDelete(entry)` makes each row deletable (agents only);
// `confirming` is the id of the row waiting for a yes.
export default function EntryList({ entries, onDelete, confirming, onAsk, onCancel, busyId }) {
  const money = (value) => formatAmount(value, { exact: true });
  return (
    <ul className="entries" aria-label="Saved invoices">
      {entries.map((entry) => (
        <li key={entry.id} className={`entry ${entry.type}`} data-testid="entry">
          <p className="entry-when">
            {formatWhen(entry.createdAt)}
            {entry.method && <span className="entry-method"> · {METHOD_NAMES[entry.method]}</span>}
          </p>
          <p className="entry-net">
            <span className="entry-label">{LABELS[entry.type]}</span> {money(entry.net)}
          </p>
          <p className="entry-parts">
            Debit {money(entry.debit)} · Credit {money(entry.credit)}
          </p>
          {onDelete &&
            (confirming === entry.id ? (
              <div className="entry-actions" role="group" aria-label="Delete this invoice?">
                <span className="hint">Delete this invoice from your list?</span>
                <button
                  type="button"
                  disabled={busyId === entry.id}
                  onClick={() => onDelete(entry)}
                >
                  Yes, delete
                </button>
                <button type="button" className="secondary" onClick={onCancel}>
                  Keep it
                </button>
              </div>
            ) : (
              <div className="entry-actions">
                <button type="button" className="secondary" onClick={() => onAsk(entry.id)}>
                  Delete
                </button>
              </div>
            ))}
        </li>
      ))}
    </ul>
  );
}
