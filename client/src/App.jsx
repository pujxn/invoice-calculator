import { useEffect, useState } from 'react';

// Placeholder shell: confirms the client can reach the API. Feature screens
// (login, upload, review, result) arrive in later steps; see SPEC.md.
export default function App() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then(setHealth)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <main className="shell">
      <h1>Invoice Calculator</h1>
      <p>Prototype scaffold. Features are built step by step from SPEC.md.</p>
      {error && <p className="status bad">API unreachable: {error}</p>}
      {health && (
        <p className="status good">
          API ok (sms: {health.providers.sms}, vision: {health.providers.vision})
        </p>
      )}
    </main>
  );
}
