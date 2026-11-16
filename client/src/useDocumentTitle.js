import { useEffect } from 'react';

// "Sign in · Ledgerly". Pass nothing for just "Ledgerly".
export default function useDocumentTitle(page) {
  useEffect(() => {
    document.title = page ? `${page} · Ledgerly` : 'Ledgerly';
  }, [page]);
}
