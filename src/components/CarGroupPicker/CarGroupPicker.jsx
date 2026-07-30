import styles from './CarGroupPicker.module.css';

export function CarGroupPicker({ carGroups, selectedIds, onChange }) {
  function handleToggle(id) {
    const newIds = selectedIds.includes(id)
      ? selectedIds.filter((sid) => sid !== id)
      : [...selectedIds, id];
    onChange(newIds);
  }

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
    </div>
  );
}
