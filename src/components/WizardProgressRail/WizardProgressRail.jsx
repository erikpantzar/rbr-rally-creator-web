import styles from './WizardProgressRail.module.css';

// The footer's animated "split time" rail: a thin line the current step's
// position marker slides along, plus the step readout text above it. Pure
// presentational -- RallyWizard owns `step`, this just draws where it is.
export function WizardProgressRail({ step, stepCount, stepTitle, stepNote }) {
  const percent = stepCount > 1 ? (step / (stepCount - 1)) * 100 : 0;

  return (
    <div className={styles.rail}>
      <div className={styles.readout}>
        <span className={styles.title}>{stepTitle}</span>
        <span className={styles.meta}>
          Step {String(step + 1).padStart(2, '0')} / {String(stepCount).padStart(2, '0')}
          {stepNote ? ` · ${stepNote}` : ''}
        </span>
      </div>
      <div className={styles.track}>
        <div className={styles.trackLine} />
        <div className={styles.fill} style={{ width: `${percent}%` }} />
        <div className={styles.marker} style={{ left: `${percent}%` }} />
      </div>
    </div>
  );
}
