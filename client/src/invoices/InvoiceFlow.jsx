import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import ExtractedAmounts from './ExtractedAmounts.jsx';
import InvoiceUpload from './InvoiceUpload.jsx';

// Upload screen, then the amounts that were read. The reading is remembered for this browser tab
// (and this phone number) so a reload does not lose edits; the picture itself is already deleted
// by the server at that point.
const KEEP_KEY = 'invoice-calculator.extracted';

function load(phone) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEEP_KEY));
    return saved?.phone === phone && saved.result && saved.values ? saved : null;
  } catch {
    return null;
  }
}

function save(value) {
  try {
    if (value) sessionStorage.setItem(KEEP_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(KEEP_KEY);
  } catch {
    // storage blocked: the reading is simply not remembered across reloads
  }
}

const startValues = (result) => ({ debit: result.debit ?? '', credit: result.credit ?? '' });

export default function InvoiceFlow() {
  const { user } = useAuth();
  const [state, setState] = useState(() => load(user.phone)); // { phone, result, values } | null

  useEffect(() => {
    save(state);
  }, [state]);

  if (!state) {
    return (
      <InvoiceUpload
        onExtracted={(result) =>
          setState({ phone: user.phone, result, values: startValues(result) })
        }
      />
    );
  }

  return (
    <ExtractedAmounts
      result={state.result}
      values={state.values}
      onChange={(field, text) =>
        setState((s) => ({ ...s, values: { ...s.values, [field]: text } }))
      }
      onReset={() => setState((s) => ({ ...s, values: startValues(s.result) }))}
      onStartOver={() => setState(null)}
    />
  );
}
