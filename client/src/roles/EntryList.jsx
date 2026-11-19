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

// A read-only list of saved invoices, newest first (the superadmin's view of an agent's list).
export default function EntryList({ entries }) {
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
        </li>
      ))}
    </ul>
  );
}
