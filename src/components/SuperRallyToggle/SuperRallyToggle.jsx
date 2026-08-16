import styles from './SuperRallyToggle.module.css';

// rbr-rally-creator-web#123: rallysimfans.hu only lets you set Super Rally
// once, when creating leg 1 -- it applies to the whole rally, there's no
// real per-leg override on the real site. Extracted out of Itinerary's old
// per-leg header (where this exact pulsing-button look originated) so
// RallyBasicsForm can render the one rally-wide instance of it, unchanged
// visually, cycling through `options` (the service's confirmed-valid
// super_rally enum) the same way the old per-leg toggle did.
export function SuperRallyToggle({ value, options, onChange }) {
  function handleClick() {
    const currentIndex = options.indexOf(value);
    const nextIndex = (currentIndex + 1 + options.length) % options.length;
    onChange(options[nextIndex]);
  }

  return (
    <button
      type="button"
      className={[styles.toggle, value !== 'disabled' ? styles.active : ''].filter(Boolean).join(' ')}
      onClick={handleClick}
    >
      Super Rally: {value}
    </button>
  );
}
