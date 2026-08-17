import styles from './ChipGroup.module.css';

// Generic single-select row of pill buttons, for wherever an option set is
// short enough to scan/pick at a glance without paying a <select>'s
// open-then-pick tax (first use: ServiceEntryForm's Duration/Mechanics/
// Skill fields, previously plain selects). `options` is the raw list to
// render as-is; `getLabel`/`getValue` default to identity so plain string
// arrays (the common case) need no extra wiring, while callers with richer
// option objects can still use this unchanged.
export function ChipGroup({ options, value, onChange, getLabel = (option) => option, getValue = (option) => option }) {
  return (
    <div className={styles.row}>
      {options.map((option) => {
        const optionValue = getValue(option);
        return (
          <button
            key={optionValue}
            type="button"
            className={[styles.chip, optionValue === value ? styles.chipActive : ''].join(' ')}
            onClick={() => onChange(optionValue)}
          >
            {getLabel(option)}
          </button>
        );
      })}
    </div>
  );
}
