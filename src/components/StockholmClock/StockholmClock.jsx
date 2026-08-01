import { useEffect, useState } from 'react';
import { stockholmNow } from '../../lib/rallyPlan.js';
import styles from './StockholmClock.module.css';

// rbr-rally-creator-web#93: live reference clock so the user always knows
// what time it is on rallysimfans.hu's own clock (Europe/Stockholm) while
// picking leg open/close times elsewhere in the app -- reuses stockholmNow()
// (rbr-rally-creator-web#63) rather than re-deriving the same Intl timezone
// math a second time.
function formatHHmm(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function StockholmClock() {
  const [now, setNow] = useState(() => stockholmNow());

  useEffect(() => {
    const id = setInterval(() => setNow(stockholmNow()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={styles.clock} title="Current time in Stockholm (rallysimfans.hu's own clock)">
      <span className={styles.label}>Stockholm</span>
      <span className={styles.time}>{formatHHmm(now)}</span>
    </div>
  );
}
