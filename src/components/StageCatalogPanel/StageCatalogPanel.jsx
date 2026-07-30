import { useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import styles from './StageCatalogPanel.module.css';

// A single draggable catalog card. Its drag id is namespaced
// (`catalog-stage-${id}`) so RoadBook's onDragEnd can tell "a catalog card
// was dropped" apart from "an existing road-book stage was reordered" just
// by looking at the id prefix -- no need to thread extra context through
// dnd-kit's event beyond `active.data.current`.
function StageCard({ stage }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `catalog-stage-${stage.id}`,
    data: { type: 'catalog-stage', stage },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[styles.card, isDragging ? styles.cardDragging : ''].join(' ')}
      {...listeners}
      {...attributes}
    >
      <p className={styles.cardName}>{stage.name}</p>
      <p className={styles.cardMeta}>
        {stage.country} &middot; {stage.surface} &middot; {stage.length}
      </p>
    </div>
  );
}

// Browse/filter side panel over the ~500-stage catalog -- drag a card into
// any road-book slot to assign it. Presentational: only reads `stages`,
// keeps its own filter state locally (same pattern as CarGroupPicker's
// carFilter/StageSlot's old filterText).
export function StageCatalogPanel({ stages }) {
  const [nameFilter, setNameFilter] = useState('');
  const [country, setCountry] = useState('');
  const [surface, setSurface] = useState('');

  const countries = useMemo(
    () => [...new Set(stages.map((s) => s.country))].sort(),
    [stages]
  );
  const surfaces = useMemo(() => [...new Set(stages.map((s) => s.surface))].sort(), [stages]);

  const filteredStages = useMemo(() => {
    const lc = nameFilter.trim().toLowerCase();
    return stages.filter((s) => {
      if (country && s.country !== country) return false;
      if (surface && s.surface !== surface) return false;
      if (lc && !s.name.toLowerCase().includes(lc)) return false;
      return true;
    });
  }, [stages, nameFilter, country, surface]);

  return (
    <div className={styles.panel}>
      <h3>Stage catalog</h3>
      <p className={styles.hint}>Drag a stage into a road-book slot.</p>

      <div className={styles.filters}>
        <input
          type="text"
          placeholder="Filter by name..."
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
          className={styles.filterInput}
        />
        <select value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">All countries</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={surface} onChange={(e) => setSurface(e.target.value)}>
          <option value="">All surfaces</option>
          {surfaces.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <p className={styles.count}>
        {filteredStages.length} of {stages.length} stages
      </p>

      <div className={styles.cardList}>
        {filteredStages.map((stage) => (
          <StageCard key={stage.id} stage={stage} />
        ))}
        {filteredStages.length === 0 && <p className={styles.empty}>No stages match this filter.</p>}
      </div>
    </div>
  );
}
