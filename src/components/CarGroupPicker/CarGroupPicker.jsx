import { useMemo, useState } from 'react';
import styles from './CarGroupPicker.module.css';

const CHEVRON_EXPANDED = '▾'; // ▾
const CHEVRON_COLLAPSED = '▸'; // ▸

// A single labelled disclosure: heading + expand/collapse toggle, and --
// when collapsed -- either a wrapping strip of chips naming what's selected
// (each removable via its own x, without expanding), an "open mode"
// summary badge, or an empty-state hint. Shared by both the car-groups and
// individual-cars sections below since the collapse/chip shell is
// identical; only the expanded body (children) and the open-mode extras
// differ.
function CollapsibleSection({
  title,
  expanded,
  onToggleExpanded,
  selectedItems,
  onRemove,
  isOpenMode = false,
  openLabel,
  onCustomize,
  children,
}) {
  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>
        <button
          type="button"
          className={styles.sectionToggle}
          onClick={onToggleExpanded}
          aria-expanded={expanded}
        >
          {title}
          <span aria-hidden="true">{expanded ? CHEVRON_EXPANDED : CHEVRON_COLLAPSED}</span>
        </button>
      </h3>

      {!expanded && isOpenMode && (
        <div className={styles.openSummary}>
          <span className={styles.openBadge}>{openLabel}</span>
          <button type="button" className={styles.customizeLink} onClick={onCustomize}>
            Customize instead
          </button>
        </div>
      )}

      {!expanded && !isOpenMode && selectedItems.length > 0 && (
        <div className={styles.chipStrip}>
          {selectedItems.map((item) => (
            <span key={item.id} className={styles.chip}>
              {item.name}
              <button
                type="button"
                className={styles.chipRemove}
                onClick={() => onRemove(item.id)}
                aria-label={`Remove ${item.name}`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {!expanded && !isOpenMode && selectedItems.length === 0 && (
        <p className={styles.emptyHint}>None selected yet</p>
      )}

      {expanded && <div className={styles.sectionBody}>{children}</div>}
    </div>
  );
}

// Presentational: takes both car groups (homologation classes) and
// individual cars in as separate lists, but they share one flat
// selectedIds array -- the site's own picker treats both id spaces the
// same way (POST /rallies' carGroupIds field accepts either, mixed freely).
//
// Car groups and individual cars each collapse independently into a chip
// summary (see CollapsibleSection above) so the picker doesn't dominate the
// page once something's selected. The "open to all car groups" state is
// deliberately *derived*, not stored: isOpenMode below just checks whether
// every car-group id currently happens to be in selectedIds. That way,
// however the selection got to "all groups" -- the button below, manually
// checking every box, or unchecking one after using the button -- the UI
// always reflects reality instead of a stale flag that could claim "open"
// while a group is actually missing.
export function CarGroupPicker({ carGroups, cars, selectedIds, onChange }) {
  const [carFilter, setCarFilter] = useState('');

  // Default collapse state is decided once, at mount: start expanded if
  // nothing's picked yet in that section (so a first-time user sees the
  // choice), start collapsed if the picker is loading an existing
  // selection (e.g. reopening a saved rally) -- the chip strip already
  // shows what's picked without needing to expand.
  const [groupsExpanded, setGroupsExpanded] = useState(
    () => !carGroups.some((g) => selectedIds.includes(g.id))
  );
  const [carsExpanded, setCarsExpanded] = useState(
    () => !cars.some((c) => selectedIds.includes(c.id))
  );

  const groupIds = useMemo(() => carGroups.map((g) => g.id), [carGroups]);
  const isOpenMode = groupIds.length > 0 && groupIds.every((id) => selectedIds.includes(id));

  function handleToggle(id, space) {
    const willSelect = !selectedIds.includes(id);
    const newIds = willSelect
      ? [...selectedIds, id]
      : selectedIds.filter((sid) => sid !== id);
    onChange(newIds);

    // Auto-collapse the first time a section goes from empty to having a
    // pick -- not on every subsequent click, which would fight whoever's
    // mid-customization by yanking the list closed under them.
    if (willSelect) {
      if (space === 'group') {
        const hadOtherSelected = carGroups.some((g) => g.id !== id && selectedIds.includes(g.id));
        if (!hadOtherSelected) setGroupsExpanded(false);
      } else {
        const hadOtherSelected = cars.some((c) => c.id !== id && selectedIds.includes(c.id));
        if (!hadOtherSelected) setCarsExpanded(false);
      }
    }
  }

  function handleOpenAll() {
    const nonGroupIds = selectedIds.filter((id) => !groupIds.includes(id));
    onChange([...nonGroupIds, ...groupIds]);
    setGroupsExpanded(false);
  }

  const selectedGroups = useMemo(
    () => carGroups.filter((g) => selectedIds.includes(g.id)),
    [carGroups, selectedIds]
  );
  const selectedCars = useMemo(
    () => cars.filter((c) => selectedIds.includes(c.id)),
    [cars, selectedIds]
  );

  const filteredCars = useMemo(() => {
    if (!carFilter.trim()) return cars;
    const lc = carFilter.toLowerCase();
    return cars.filter((c) => c.name.toLowerCase().includes(lc));
  }, [cars, carFilter]);

  return (
    <div className={styles.container}>
      {!isOpenMode && (
        <button type="button" className={styles.openAllButton} onClick={handleOpenAll}>
          Open to all car groups
        </button>
      )}

      <CollapsibleSection
        title="Car groups"
        expanded={groupsExpanded}
        onToggleExpanded={() => setGroupsExpanded((v) => !v)}
        selectedItems={selectedGroups}
        onRemove={(id) => handleToggle(id, 'group')}
        isOpenMode={isOpenMode}
        openLabel="Open — all car groups eligible"
        onCustomize={() => setGroupsExpanded(true)}
      >
        <div className={styles.checkboxList}>
          {carGroups.map((group) => (
            <label key={group.id} className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={selectedIds.includes(group.id)}
                onChange={() => handleToggle(group.id, 'group')}
              />
              {group.name}
            </label>
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Individual cars"
        expanded={carsExpanded}
        onToggleExpanded={() => setCarsExpanded((v) => !v)}
        selectedItems={selectedCars}
        onRemove={(id) => handleToggle(id, 'car')}
      >
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
                onChange={() => handleToggle(car.id, 'car')}
              />
              {car.name}
            </label>
          ))}
        </div>
      </CollapsibleSection>
    </div>
  );
}
