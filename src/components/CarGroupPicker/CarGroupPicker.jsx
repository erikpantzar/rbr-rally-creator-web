import { useMemo, useState } from 'react';
import styles from './CarGroupPicker.module.css';

// Builds the live selected-summary text shown in a <summary>, whether the
// <details> is open or collapsed -- so the count/names are visible either
// way, per the maintainer's plan on issue #60:
//   0 selected -> muted "None selected"
//   1-3 selected -> comma-joined names
//   4+ selected -> first 2 names + "+N more" (full list in title= on hover)
function summarizeSelection(items) {
  if (items.length === 0) {
    return { text: 'None selected', title: undefined, muted: true };
  }
  const names = items.map((item) => item.name);
  if (items.length <= 3) {
    return { text: names.join(', '), title: undefined, muted: false };
  }
  const shown = names.slice(0, 2).join(', ');
  const more = names.length - 2;
  return { text: `${shown}, +${more} more`, title: names.join(', '), muted: false };
}

// A single <details>/<summary> disclosure with a live selected-count
// summary baked into the <summary> itself (title + count/names), reusing
// the native disclosure element already used for JobProgress's "Debug
// snippet" (see JobProgress.module.css's .details/.details summary).
// Native <details> keeps working inside the header block's disabled
// fieldset -- fieldset only disables form *controls*, not disclosure
// elements -- so `locked` rally views are unaffected.
//
// Fully controlled via open/onToggle (rather than defaultOpen/uncontrolled)
// so the "Open rally" checkbox below can force sections open/closed, while
// a manual click on <summary> still works normally -- the native toggle
// event just flows back into onToggle and updates the owning state.
function DisclosureSection({ title, open, onToggle, selectedItems, children }) {
  const summary = summarizeSelection(selectedItems);
  return (
    <details className={styles.details} open={open} onToggle={(e) => onToggle(e.target.open)}>
      <summary className={styles.summary}>
        <span className={styles.summaryTitle}>{title}</span>
        <span
          className={summary.muted ? styles.summaryMeta : styles.summaryMetaActive}
          title={summary.title}
        >
          {summary.text}
        </span>
      </summary>
      <div className={styles.sectionBody}>{children}</div>
    </details>
  );
}

// Presentational: takes both car groups (homologation classes) and
// individual cars in as separate lists, but they share one flat
// selectedIds array -- the site's own picker treats both id spaces the
// same way (POST /rallies' carGroupIds field accepts either, mixed freely).
//
// Confirmed catalog size: 22 car groups + 102 individual cars. The
// individual-cars list is the real space hog (~400-600px of long names),
// not the groups, so it defaults collapsed while car groups default open
// (see issue #60 maintainer plan). Each section is a native <details> with
// a live selected-count summary, so what's picked stays visible either way.
export function CarGroupPicker({ carGroups, cars, selectedIds, onChange }) {
  const [carFilter, setCarFilter] = useState('');

  // Default open state: car groups open, individual cars collapsed --
  // cars are the space hog (102 long names, ~400-600px) and the rarer
  // intent (picking specific cars rather than whole homologation classes).
  // Both stay independently, manually expandable/collapsible via <summary>
  // clicks (synced back through onToggle below); the "Open rally" checkbox
  // just drives them programmatically on top of that.
  const [groupsOpen, setGroupsOpen] = useState(true);
  const [carsOpen, setCarsOpen] = useState(false);

  const groupIds = useMemo(() => carGroups.map((g) => g.id), [carGroups]);

  // "Open rally (all car groups)" is derived state, not persisted --
  // checked whenever every car-group id currently happens to be in
  // selectedIds, however that came to be (the checkbox itself, or manually
  // checking every box one by one).
  const isOpenRally = groupIds.length > 0 && groupIds.every((id) => selectedIds.includes(id));

  function handleToggle(id) {
    const willSelect = !selectedIds.includes(id);
    const newIds = willSelect ? [...selectedIds, id] : selectedIds.filter((sid) => sid !== id);
    onChange(newIds);
  }

  function handleOpenRallyToggle(checked) {
    if (checked) {
      // Add all 22 group ids, preserving any individually-picked car ids,
      // and force both sections collapsed.
      const nonGroupIds = selectedIds.filter((id) => !groupIds.includes(id));
      onChange([...nonGroupIds, ...groupIds]);
      setGroupsOpen(false);
      setCarsOpen(false);
    } else {
      // Remove all group ids; car picks stay intact. Reopen "Car groups"
      // for manual editing.
      onChange(selectedIds.filter((id) => !groupIds.includes(id)));
      setGroupsOpen(true);
    }
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
      <label className={styles.openRallyLabel}>
        <input
          type="checkbox"
          checked={isOpenRally}
          onChange={(e) => handleOpenRallyToggle(e.target.checked)}
        />
        Open rally (all car groups)
      </label>

      <DisclosureSection
        title="Car groups"
        open={groupsOpen}
        onToggle={setGroupsOpen}
        selectedItems={selectedGroups}
      >
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
      </DisclosureSection>

      <DisclosureSection
        title="Individual cars"
        open={carsOpen}
        onToggle={setCarsOpen}
        selectedItems={selectedCars}
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
                onChange={() => handleToggle(car.id)}
              />
              {car.name}
            </label>
          ))}
        </div>
      </DisclosureSection>
    </div>
  );
}
