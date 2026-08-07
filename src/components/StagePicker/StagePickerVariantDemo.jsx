import { useState } from 'react';
import { StagePicker } from './StagePicker.jsx';
import styles from './StagePickerVariantDemo.module.css';

// THROWAWAY: dev-only comparison tool, delete after Erik picks a variant
// (#107 follow-up). Renders the real StagePicker three times side by side,
// each column showing a different "already added to this rally" decoration
// style, so Erik can eyeball all three at once instead of clicking between
// them. Reached via #stage-picker-demo (see main.jsx) -- never wired into
// the real app flow, never fed real rally data.
//
// Fake catalog + fake stagePlanCounts here on purpose: this is a visual
// comparison, not a test of real picker data flow. A couple of stage ids
// with counts 1, 2 and 5 cover every branch the three variants care about
// (count === 1 vs count > 1 vs "any count").
const DEMO_STAGES = [
  { id: 'demo-1', name: 'Kailleen Forest', country: 'Wales', surface: 'gravel', length: '8.2 km' },
  { id: 'demo-2', name: 'Myherin', country: 'Wales', surface: 'gravel', length: '11.4 km' },
  { id: 'demo-3', name: 'Sweet Lamb', country: 'Wales', surface: 'gravel', length: '6.1 km' },
  { id: 'demo-4', name: 'Hafren', country: 'Wales', surface: 'gravel', length: '19.8 km' },
  { id: 'demo-5', name: 'Fionnaghyle', country: 'Ireland', surface: 'tarmac', length: '9.6 km' },
  { id: 'demo-6', name: 'Ballagh', country: 'Ireland', surface: 'tarmac', length: '7.3 km' },
];

const DEMO_STAGE_PLAN_COUNTS = {
  'demo-1': 1,
  'demo-3': 2,
  'demo-5': 5,
};

const VARIANTS = [
  { id: '1', label: 'Border + badge (opacity unchanged)' },
  { id: '2', label: 'Half-opacity + badge' },
  { id: '3', label: 'Corner ribbon, no count' },
];

export function StagePickerVariantDemo() {
  // Radio switcher above all three columns toggles which single variant is
  // "live" -- the other two columns keep their own fixed variant regardless,
  // since the point is comparing all three at once, not previewing one at a
  // time. See StagePicker.module.css: every decoration rule is scoped under
  // [data-decoration-variant="N"], so this state only matters for the
  // "highlighted" column below, not for what each column actually renders.
  const [highlighted, setHighlighted] = useState('1');

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>StagePicker decoration variants (#107 follow-up)</h1>
      <p className={styles.subtitle}>
        Throwaway comparison tool -- not part of the real app. Fake stages, fake &quot;already in
        this rally&quot; counts (demo-1: 1&times;, demo-3: 2&times;, demo-5: 5&times;).
      </p>

      <fieldset className={styles.switcher}>
        <legend>Highlight for comparison</legend>
        {VARIANTS.map((v) => (
          <label key={v.id} className={styles.switcherOption}>
            <input
              type="radio"
              name="variant-highlight"
              value={v.id}
              checked={highlighted === v.id}
              onChange={() => setHighlighted(v.id)}
            />
            {v.label}
          </label>
        ))}
      </fieldset>

      <div className={styles.columns}>
        {VARIANTS.map((v) => (
          <div
            key={v.id}
            className={styles.column}
            data-decoration-variant={v.id}
            data-highlighted={v.id === highlighted}
          >
            <h2 className={styles.columnTitle}>
              Variant {v.id}: {v.label}
            </h2>
            <StagePicker
              stages={DEMO_STAGES}
              selectedStageId={null}
              onSelect={() => {}}
              stagePlanCounts={DEMO_STAGE_PLAN_COUNTS}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
