import { useEffect, useState } from 'react';
import { getHealth } from '../../lib/rallyApi.js';
import styles from './ServiceStatus.module.css';

const POLL_INTERVAL_MS = 20_000;

// rbr-rally-creator-web#97: header indicator for whether the backend (and
// specifically its Playwright automation -- not just the bare HTTP server)
// is up. Self-contained like StockholmClock -- polls on its own timer, no
// state plumbing needed from App.jsx beyond baseUrl.
export function ServiceStatus({ baseUrl }) {
  const [state, setState] = useState('checking'); // checking | up | down

  useEffect(() => {
    if (!baseUrl) return;
    let cancelled = false;

    async function check() {
      const res = await getHealth(baseUrl);
      if (cancelled) return;
      setState(res.ok ? 'up' : 'down');
    }

    check();
    const id = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [baseUrl]);

  const label =
    state === 'up'
      ? 'Rally creator backend is up'
      : state === 'down'
        ? 'Rally creator backend is unreachable'
        : 'Checking rally creator backend...';

  return (
    <div className={styles.status} title={label}>
      <span className={styles.dot} data-state={state} />
      <span className={styles.label}>Backend</span>
    </div>
  );
}
