import styles from './WizardProgressRail.module.css';

// The footer's "split time" rail: a thin line with one waypoint button per
// step, plus the step readout text above it. RallyWizard owns `step` and
// `onStepChange` (a straight `setStep`) -- this just draws where the wizard
// is and lets the driver jump straight to any waypoint. Per
// rbr-rally-creator-web#119: jumping is unconditional in either direction,
// same "Back/Next never blocked by validation" rule WizardFooter already
// applies (only Publish itself is gated).
export function WizardProgressRail({ step, stepCount, stepTitle, stepNote, stepTitles, onStepChange }) {
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
        <div className={styles.fill} style={{ width: `calc((100% - 12px) * ${percent / 100})` }} />
        <div className={styles.waypoints}>
          {stepTitles.map((title, index) => {
            const state = index === step ? 'active' : index < step ? 'done' : 'upcoming';
            return (
              <button
                key={title}
                type="button"
                className={styles.waypoint}
                data-state={state}
                aria-current={index === step ? 'step' : undefined}
                aria-label={`Go to step ${index + 1}: ${title}`}
                onClick={() => onStepChange(index)}
              >
                <span className={styles.waypointLabel}>{title}</span>
                <span className={styles.waypointDot} />
                <span className={styles.waypointNumber}>{index + 1}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
