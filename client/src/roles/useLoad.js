import { useCallback, useEffect, useState } from 'react';

// Runs `fetcher()` when the page opens (and again on reload()). Gives { data, error, loading }.
// An error from the server is shown as its message; the caller keeps the data it already had.
export default function useLoad(fetcher) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetcher()
      .then((data) => !cancelled && setState({ data, error: '', loading: false }))
      .catch(
        (err) =>
          !cancelled && setState((s) => ({ data: s.data, error: err.message, loading: false })),
      );
    return () => {
      cancelled = true;
    };
    // fetcher is a new function on every render; only the tick restarts the load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload, setData: (data) => setState((s) => ({ ...s, data })) };
}
