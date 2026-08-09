import { formatKm, sumStagePlanKm, sumStagePlanKmBySurface, summarizeServicePlan } from '../../lib/rallyPlan.js';
import styles from './RallyTelemetryRail.module.css';

const SURFACE_ORDER = ['gravel', 'snow', 'tarmac'];
const SURFACE_LABELS = { gravel: 'Gravel', snow: 'Snow', tarmac: 'Tarmac' };

// Sticky sidebar for the road book step -- purely a read-model over the same
// stagePlan/legSchedule/stages RoadBook already renders, computed with the
// same rallyPlan.js helpers Itinerary.jsx uses internally for its own
// (not exposed upward) rally-total display. Presentational only: no props
// change any state, this is a summary panel, not a control surface.
export function RallyTelemetryRail({ stages, stagePlan, legSchedule }) {
  const stageByCatalogId = new Map(stages.map((s) => [s.id, s]));
  const totalKm = sumStagePlanKm(stagePlan, stageByCatalogId);
  const bySurface = sumStagePlanKmBySurface(stagePlan, stageByCatalogId);
  const service = summarizeServicePlan(stagePlan);

  const surfaceTotalKm = SURFACE_ORDER.reduce((sum, key) => sum + bySurface[key].km, 0) || 1;

  let cursor = 0;
  const legRanges = [];
  for (const leg of legSchedule) {
    const startIndex = cursor;
    cursor += leg.stage_count;
    legRanges.push({ startIndex, endIndex: cursor });
  }

  return (
    <aside className={styles.rail}>
      <div className={styles.card}>
        <p className={styles.cardLabel}>Rally distance</p>
        <p className={styles.totalValue}>{formatKm(totalKm)}</p>
        <p className={styles.totalSub}>
          {stagePlan.length} stage{stagePlan.length === 1 ? '' : 's'} · {legSchedule.length} leg
          {legSchedule.length === 1 ? '' : 's'}
        </p>
      </div>

      <div className={styles.card}>
        <p className={styles.cardLabel}>Surface mix</p>
        <div className={styles.mixBar}>
          {SURFACE_ORDER.map((key) => {
            const pct = (bySurface[key].km / surfaceTotalKm) * 100;
            if (pct <= 0) return null;
            return <span key={key} className={styles.mixSegment} data-surface={key} style={{ width: `${pct}%` }} />;
          })}
        </div>
        <div className={styles.mixLegend}>
          {SURFACE_ORDER.map((key) => (
            <div key={key} className={styles.mixLegendRow}>
              <span className={styles.mixLegendLabel} data-surface={key}>
                {SURFACE_LABELS[key]}
              </span>
              <span className={styles.mixLegendValue}>
                {formatKm(bySurface[key].km)} · {bySurface[key].count}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.card}>
        <p className={styles.cardLabel}>Legs</p>
        {legRanges.map(({ startIndex, endIndex }, i) => {
          const legKm = sumStagePlanKm(stagePlan.slice(startIndex, endIndex), stageByCatalogId);
          return (
            <div key={i} className={styles.legRow}>
              <span>Leg {i + 1}</span>
              <span className={styles.legRowKm}>{formatKm(legKm)}</span>
            </div>
          );
        })}
        <div className={styles.railDivider} />
        <div className={styles.legRow} data-accent="">
          <span>Service parks</span>
          <span className={styles.legRowKm}>
            {service.count} · {service.minutes} min
          </span>
        </div>
      </div>
    </aside>
  );
}
