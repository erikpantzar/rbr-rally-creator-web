import { useEffect, useRef, useState } from 'react';
import styles from './BootSequence.module.css';

// Auto-completes this long after mount if the user never skips it -- matches
// the mockup's 5-light stagger (0.30s/0.52s/0.74s/0.96s/1.18s, 220ms apart)
// finishing around 1.4s, then the GO flash + fade-out animation itself
// (see BootSequence.module.css's bootOut, 3.1s total) running the rest.
const AUTO_COMPLETE_MS = 2700;
const LIGHT_COUNT = 5;

// One-time "start lights" countdown shown before the wizard itself, mounted
// once at the top of RallyWizard. Purely decorative -- no rally data, no
// state the rest of the app depends on -- so it fails safe in every
// direction: skippable by any keypress/click, and skipped outright (no
// render at all) under prefers-reduced-motion rather than just speeding up,
// since a flashing "GO" plus a moving light streak is exactly the kind of
// motion that preference exists to suppress.
export function BootSequence({ onComplete }) {
  const [reducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  const [booted, setBooted] = useState(reducedMotion);
  const completedRef = useRef(reducedMotion);

  function finish() {
    if (completedRef.current) return;
    completedRef.current = true;
    setBooted(true);
    onComplete?.();
  }

  useEffect(() => {
    if (reducedMotion) return undefined;

    const timer = setTimeout(finish, AUTO_COMPLETE_MS);
    window.addEventListener('keydown', finish);
    window.addEventListener('pointerdown', finish);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', finish);
      window.removeEventListener('pointerdown', finish);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (booted) return null;

  return (
    <div className={styles.boot} data-booted={booted}>
      <div className={styles.trails} aria-hidden="true">
        <span className={styles.trailFar} />
        <span className={styles.trailNear} />
        <span className={styles.car} />
      </div>
      <div className={styles.content}>
        <p className={styles.kicker}>Stage ready</p>
        <div className={styles.lights}>
          {Array.from({ length: LIGHT_COUNT }, (_, i) => (
            <span key={i} className={styles.light} style={{ '--light-index': i }} />
          ))}
        </div>
        <p className={styles.go}>GO</p>
        <p className={styles.skipHint}>Press anything to skip</p>
      </div>
    </div>
  );
}
