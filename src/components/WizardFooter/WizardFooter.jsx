import { WizardProgressRail } from '../WizardProgressRail/WizardProgressRail.jsx';
import styles from './WizardFooter.module.css';

// Fixed "split-time" bar across the bottom of the wizard. Back/Next are
// always enabled -- per-step validation never blocks navigation (see
// RallyBuilder.jsx's readinessProblems, which still only gates Publish on
// the last step, exactly as it gated Create Rally before this rebuild).
export function WizardFooter({
  step,
  stepCount,
  stepTitle,
  stepTitles,
  stepNote,
  onBack,
  onNext,
  onStepChange,
  isLastStep,
  onPublish,
  canPublish,
  submitting,
  publishLabel,
}) {
  return (
    <footer className={styles.footer}>
      <button type="button" className={styles.backButton} onClick={onBack} disabled={step === 0}>
        ◂ Back
      </button>

      <WizardProgressRail
        step={step}
        stepCount={stepCount}
        stepTitle={stepTitle}
        stepTitles={stepTitles}
        stepNote={stepNote}
        onStepChange={onStepChange}
      />

      {isLastStep ? (
        <button
          type="button"
          className={`${styles.nextButton} ${styles.publishButton}`}
          onClick={onPublish}
          disabled={!canPublish}
        >
          {submitting ? publishLabel : 'Publish ▸'}
        </button>
      ) : (
        <button type="button" className={styles.nextButton} onClick={onNext}>
          Next ▸
        </button>
      )}
    </footer>
  );
}
