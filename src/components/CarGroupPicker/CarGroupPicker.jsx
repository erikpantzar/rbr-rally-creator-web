import { useMemo, useState } from 'react';
import styles from './CarGroupPicker.module.css';

// Presentational: takes both car groups (homologation classes) and
// individual cars in as separate lists, but they share one flat
// selectedIds array -- the site's own picker treats both id spaces the
// same way (POST /rallies' carGroupIds field accepts either, mixed freely).
export function CarGroupPicker({ carGroups, cars, selectedIds, onChange }) {
  const [carFilter, setCarFilter] = useState('');

  function handleToggle(id) {
    const newIds = selectedIds.includes(id)
      ? selectedIds.filter((sid) => sid !== id)
      : [...selectedIds, id];
    onChange(newIds);
  }

  const filteredCars = useMemo(() => {
    if (!carFilter.trim()) return cars;
    const lc = carFilter.toLowerCase();
    return cars.filter((c) => c.name.toLowerCase().includes(lc));
  }, [cars, carFilter]);

  return (
    <div className={styles.container}>
      <h3>Car groups</h3>
      <div className={styles.checkboxList}>
        {carGroups.map((group) => (
          <label key={group.id} className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={selectedIds.includes(group.id)}
              onChange={() => handleToggle(group.id)}
            />
            {group.name}
          </label>
        ))}
      </div>

      <h3>Individual cars</h3>
      <input
        type="text"
        placeholder="Filter by name..."
        value={carFilter}
        onChange={(e) => setCarFilter(e.target.value)}
        className={styles.filterInput}
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
  );
}
