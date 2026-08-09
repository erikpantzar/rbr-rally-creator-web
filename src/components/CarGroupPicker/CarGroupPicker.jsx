import { useMemo, useState } from 'react';
import { Input } from '../Input/Input.jsx';
import styles from './CarGroupPicker.module.css';

// Presentational: takes both car groups (homologation classes) and
// individual cars in as separate lists, but they share one flat
// selectedIds array -- the site's own picker treats both id spaces the
// same way (POST /rallies' carGroupIds field accepts either, mixed freely).
//
// Confirmed catalog size: 22 car groups + 102 individual cars. Car groups
// render as a clickable card grid (one glance shows every group and which
// are selected); individual cars stay a checkbox list behind a "+ Single
// cars" card, since 102 long names don't fit a card grid the way 22 short
// group names do -- collapsed by default for the same reason the old
// <details> defaulted it closed (issue #60: cars are the space hog, and the
// rarer intent).
export function CarGroupPicker({ carGroups, cars, selectedIds, onChange }) {
  const [carFilter, setCarFilter] = useState('');
  const [carsOpen, setCarsOpen] = useState(false);

  const groupIds = useMemo(() => carGroups.map((g) => g.id), [carGroups]);

  // "Open rally (all car groups)" is derived state, not persisted --
  // checked whenever every car-group id currently happens to be in
  // selectedIds, however that came to be (the checkbox itself, or manually
  // clicking every card one by one).
  const isOpenRally = groupIds.length > 0 && groupIds.every((id) => selectedIds.includes(id));

  function handleToggle(id) {
    const willSelect = !selectedIds.includes(id);
    const newIds = willSelect ? [...selectedIds, id] : selectedIds.filter((sid) => sid !== id);
    onChange(newIds);
  }

  function handleOpenRallyToggle(checked) {
    if (checked) {
      // Add all 22 group ids, preserving any individually-picked car ids.
      const nonGroupIds = selectedIds.filter((id) => !groupIds.includes(id));
      onChange([...nonGroupIds, ...groupIds]);
    } else {
      // Remove all group ids; car picks stay intact.
      onChange(selectedIds.filter((id) => !groupIds.includes(id)));
    }
  }

  const selectedCars = useMemo(() => cars.filter((c) => selectedIds.includes(c.id)), [cars, selectedIds]);

  const filteredCars = useMemo(() => {
    if (!carFilter.trim()) return cars;
    const lc = carFilter.toLowerCase();
    return cars.filter((c) => c.name.toLowerCase().includes(lc));
  }, [cars, carFilter]);

  return (
    <div className={styles.container}>
      <label className={styles.openRallyLabel}>
        <input
          type="checkbox"
          checked={isOpenRally}
          onChange={(e) => handleOpenRallyToggle(e.target.checked)}
        />
        Open rally (all car groups)
      </label>

      <div className={styles.groupGrid}>
        {carGroups.map((group) => {
          const selected = selectedIds.includes(group.id);
          return (
            <button
              key={group.id}
              type="button"
              className={styles.groupCard}
              data-selected={selected}
              aria-pressed={selected}
              onClick={() => handleToggle(group.id)}
            >
              <span className={styles.groupCardName}>{group.name}</span>
              <span className={styles.groupCardStatus}>{selected ? 'Selected' : 'Not selected'}</span>
            </button>
          );
        })}

        <button
          type="button"
          className={styles.singleCarsCard}
          data-selected={selectedCars.length > 0}
          aria-expanded={carsOpen}
          onClick={() => setCarsOpen((open) => !open)}
        >
          <span className={styles.groupCardName}>+ Single cars</span>
          <span className={styles.groupCardStatus}>
            {selectedCars.length > 0 ? `${selectedCars.length} selected` : 'Pick individually'}
          </span>
        </button>
      </div>

      {carsOpen && (
        <div className={styles.singleCarsPanel}>
          <Input
            type="text"
            size="sm"
            placeholder="Filter by name..."
            value={carFilter}
            onChange={(e) => setCarFilter(e.target.value)}
          />
          <div className={styles.checkboxList}>
            {filteredCars.map((car) => (
              <label key={car.id} className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(car.id)}
                  onChange={() => handleToggle(car.id)}
                />
                {car.name}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
