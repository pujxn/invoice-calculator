import { formatAmount, LABELS } from '@ledgerly/money';

// Debit total, Credit total and the net of the two, for one agent or for everyone.
// `summary` is { count, debit, credit, net, type } from the API; amounts are shown with every decimal.
export default function Totals({ summary, title, headingLevel = 2 }) {
  const Heading = `h${headingLevel}`;
  const money = (value) => formatAmount(value, { exact: true });
  const empty = summary.count === 0;
  return (
    <section className={`totals ${empty ? 'balanced' : summary.type}`}>
      <Heading className="totals-title">{title}</Heading>
      <p className="totals-net" data-testid="totals-net">
        <span className="totals-label">{empty ? 'Nothing yet' : LABELS[summary.type]}</span>
        <span className="totals-amount">{empty ? '₹0.00' : money(summary.net)}</span>
      </p>
      <dl className="totals-parts">
        <div>
          <dt>Debit</dt>
          <dd data-testid="totals-debit">{money(summary.debit)}</dd>
        </div>
        <div>
          <dt>Credit</dt>
          <dd data-testid="totals-credit">{money(summary.credit)}</dd>
        </div>
        <div>
          <dt>Invoices</dt>
          <dd data-testid="totals-count">{summary.count}</dd>
        </div>
      </dl>
    </section>
  );
}
