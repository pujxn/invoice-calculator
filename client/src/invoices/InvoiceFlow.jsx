import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import ExtractedAmounts from './ExtractedAmounts.jsx';
import InvoiceUpload from './InvoiceUpload.jsx';
import ResultScreen from './ResultScreen.jsx';
import { READING_KEY } from '../storageKeys.js';

// Upload screen, then the amounts that were read, then the final amount. The reading is remembered for this browser tab
// (and this phone number) so a reload does not lose edits; the picture itself is already deleted
// by the server at that point.
const KEEP_KEY = READING_KEY;

function load(phone) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEEP_KEY));
    return saved?.phone === phone && saved.result && saved.values
      ? { ...saved, stage: saved.stage === 'result' ? 'result' : 'review' }
      : null;
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
  const location = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState(() => load(user.phone)); // { phone, result, values, stage } | null
  // The final amount screen gets its own browser history entry, so the browser's Back button (and
  // Android's back key) goes back to the amounts instead of leaving the app, and Forward returns.
  const onResultEntry = location.state?.stage === 'result';
  const lastKey = useRef(location.key);
  // Set when the upload screen is shown again after the amounts, so focus can move to it.
  const [cameBack, setCameBack] = useState(false);

  useEffect(() => {
    save(state);
  }, [state]);

  useEffect(() => {
    if (lastKey.current === location.key) return; // not a navigation, just another render
    lastKey.current = location.key;
    setState((s) => {
      if (!s) return s;
      const stage = onResultEntry ? 'result' : 'review';
      return s.stage === stage ? s : { ...s, stage };
    });
  }, [location.key, onResultEntry]);

  if (!state) {
    return (
      <InvoiceUpload
        focusHeading={cameBack}
        onExtracted={(result) => {
          setCameBack(false);
          setState({ phone: user.phone, result, values: startValues(result), stage: 'review' });
        }}
      />
    );
  }

  const change = (field, text) =>
    setState((s) => ({ ...s, values: { ...s.values, [field]: text } }));
  const reset = () => setState((s) => ({ ...s, values: startValues(s.result) }));
  const startOver = () => {
    setCameBack(true);
    setState(null);
  };
  const showResult = () => {
    setState((s) => ({ ...s, stage: 'result' }));
    navigate(location.pathname, { state: { stage: 'result' } });
  };
  // Back from the result: pop the entry we pushed, or just switch screens if there is none
  // (for example after a reload that lost it).
  const showReview = () => {
    if (onResultEntry) navigate(-1);
    else setState((s) => ({ ...s, stage: 'review' }));
  };

  if (state.stage === 'result') {
    return (
      <ResultScreen
        result={state.result}
        values={state.values}
        onChange={change}
        onReset={reset}
        onBack={showReview}
        onStartOver={startOver}
        saved={state.saved ?? null}
        onSaved={(key) => setState((s) => ({ ...s, saved: key }))}
      />
    );
  }

  return (
    <ExtractedAmounts
      result={state.result}
      values={state.values}
      onChange={change}
      onReset={reset}
      onStartOver={startOver}
      onCalculate={showResult}
    />
  );
}
