// Lets a cheap reader go first and a better one step in when the first is not sure.
// Used as: free OCR first, AI second (only when OCR_FALLBACK_TO_CLAUDE is on and a key is set).

// Set on the answer so the pipeline can say which reader actually produced it.
export const USED_PROVIDER = Symbol('usedProvider');

export function isUnsure(answer) {
  return (
    !answer.readable ||
    answer.confidence === 'low' ||
    (answer.debit === null && answer.credit === null)
  );
}

export function createFallbackProvider({ primary, secondary }) {
  return {
    name: primary.name,
    model: primary.model,
    close: () => primary.close?.(),
    async extract(input) {
      let first;
      let firstError;
      try {
        first = await primary.extract(input);
      } catch (err) {
        if (input.signal?.aborted) throw err; // the user cancelled: do not start another reading
        firstError = err;
      }
      if (first && !isUnsure(first)) return first;
      try {
        const second = await secondary.extract(input);
        const why = firstError
          ? 'the free OCR could not read it'
          : 'the free OCR was not sure of the amounts';
        const answer = {
          ...second,
          notes: `${second.notes ? `${second.notes} ` : ''}Read by AI because ${why}.`.trim(),
        };
        Object.defineProperty(answer, USED_PROVIDER, {
          value: { name: secondary.name, model: secondary.model },
        });
        return answer;
      } catch (err) {
        if (first?.readable) return first; // better a cautious OCR answer than an error
        throw firstError ?? err;
      }
    },
  };
}
