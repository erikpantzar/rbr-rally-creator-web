import { getServiceTier } from '../../lib/rallyPlan.js';
import styles from './ServiceBlock.module.css';

// rbr-rally-creator-web#80: presentational-only piece shared by two entry
// points -- the full-width blue bar RoadBook renders after each non-final
// stage brick, and the compact summary/button StageConfigModal renders in
// its own "Service" form-group. Both just render this and call onClick to
// open ServiceConfigModal scoped to their stage; neither owns any service
// state itself.
//
// `variant` picks between the two layouts ('bar' for RoadBook's full-width
// leg-row block, 'summary' for StageConfigModal's inline button) since the
// visual shape differs enough that one CSS class can't cover both, but the
// underlying "tier -> label/color" logic is identical either way.
export function ServiceBlock({ serviceTime, variant = 'bar', disabled = false, disabledReason = null, onClick }) {
  const tier = getServiceTier(serviceTime);
  const hasService = tier.key !== 'none';

  const className = [
    styles.block,
    styles[variant],
    hasService ? styles.active : styles.empty,
    disabled ? styles.disabled : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledReason : hasService ? `${tier.label} — click to edit` : 'Click to add service'}
    >
      {hasService ? (
        <>
          <span className={styles.label}>{tier.label}</span>
          <span className={styles.detail}>{serviceTime}</span>
        </>
      ) : (
        <span className={styles.label}>+ Add service</span>
      )}
    </button>
  );
}
