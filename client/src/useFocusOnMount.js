import { useEffect, useRef } from 'react';

// Moves keyboard and screen reader focus to a screen's heading when the screen appears, so the
// change from one step to the next is announced. Give the heading the returned ref and tabIndex={-1}.
export default function useFocusOnMount() {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return ref;
}
