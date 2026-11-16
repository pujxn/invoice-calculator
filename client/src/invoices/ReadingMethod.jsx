import { useEffect, useState } from 'react';
import { METHOD_KEY } from '../storageKeys.js';
import { getReadingMethods } from './invoiceApi.js';

// What the person sees for each way of reading, on the screen where they choose and on the result.
export const METHOD_NAMES = { ocr: 'Local OCR', claude: 'AI (Claude)', mock: 'Demo values' };
export const methodName = (id) => METHOD_NAMES[id] ?? id;

const remembered = {
  read() {
    try {
      return sessionStorage.getItem(METHOD_KEY);
    } catch {
      return null;
    }
  },
  write(id) {
    try {
      sessionStorage.setItem(METHOD_KEY, id);
    } catch {
      // storage blocked: the choice is just not remembered
    }
  },
};

// Asks the server which ways of reading it offers, and keeps the person's choice for this tab.
// `choices` is empty (the switch stays hidden) when there is nothing to switch between or the
// list could not be fetched; `method` is then undefined and the server uses its own default.
export function useReadingMethod(token) {
  const [offer, setOffer] = useState(null);
  const [picked, setPicked] = useState(remembered.read);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    Promise.resolve()
      .then(() => getReadingMethods(token))
      .then((data) => !cancelled && Array.isArray(data?.methods) && setOffer(data))
      .catch(() => {}); // no list: no switch, and the server decides
    return () => {
      cancelled = true;
    };
  }, [token]);

  const choices = offer && offer.methods.length > 1 ? offer.methods : [];
  const usable = (id) => choices.some((m) => m.id === id && m.available);
  const method = usable(picked)
    ? picked
    : offer && usable(offer.default)
      ? offer.default
      : undefined;
  const choose = (id) => {
    setPicked(id);
    remembered.write(id);
  };
  return { choices, method, choose };
}

// A two-way switch: "Read with  (•) Local OCR  ( ) AI (Claude)". Real radio buttons, so the arrow
// keys, screen readers and the keyboard all work without extra code. A way that is not set up on
// this server is shown greyed out with the reason beside it, instead of failing later.
export default function ReadingMethod({ choices, method, onChoose, disabled = false }) {
  if (choices.length === 0) return null;
  const unavailable = choices.filter((m) => !m.available);
  return (
    <fieldset className="method" disabled={disabled}>
      <legend>Read with</legend>
      <div className="method-options">
        {choices.map((m) => (
          <label
            key={m.id}
            className={`method-option${method === m.id ? ' on' : ''}${m.available ? '' : ' off'}`}
          >
            <input
              type="radio"
              name="reading-method"
              value={m.id}
              checked={method === m.id}
              disabled={!m.available}
              aria-describedby={m.available ? undefined : `method-why-${m.id}`}
              onChange={() => onChoose(m.id)}
            />
            <span>{m.label}</span>
          </label>
        ))}
      </div>
      {unavailable.map((m) => (
        <p key={m.id} id={`method-why-${m.id}`} className="hint method-why">
          {m.label} is not available: {m.reason ?? 'it is not set up on this server.'}
        </p>
      ))}
      {method === 'ocr' && (
        <p className="hint method-why">
          Free and private: read on the server, no AI service. It is less sure with blurry photos.
        </p>
      )}
      {method === 'claude' && (
        <p className="hint method-why">Sent to the AI service. Usually the most accurate.</p>
      )}
    </fieldset>
  );
}
