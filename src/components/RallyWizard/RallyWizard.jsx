import { useEffect } from 'react';
import { WizardHeader } from '../WizardHeader/WizardHeader.jsx';
import { WizardFooter } from '../WizardFooter/WizardFooter.jsx';
import { BootSequence } from '../BootSequence/BootSequence.jsx';
import styles from './RallyWizard.module.css';

// Presentational wizard shell: fixed header/footer chrome plus the
// depth-push panel stack. Knows nothing about rally domain state -- step
// index and the four panels are handed in from RallyBuilder.jsx, which
// keeps owning every actual field/effect/handler as it did before this
// rebuild.
//
// All panels stay mounted at every step (only their data-panel-state
// changes) rather than conditionally rendering the active one: the road
// book panel owns dnd-kit's DndContext plus undo-timer/modal state that
// must not be torn down by switching steps, and the draft-autosave/
// leg-time-recheck effects in RallyBuilder already run regardless of which
// section is "visible" today.
export function RallyWizard({
  baseUrl,
  rallyName,
  credentialsSaved,
  credentialsUsername,
  credentialsSlot,
  sidebarOpen,
  onOpenSidebar,
  step,
  stepTitles,
  stepNotes,
  onStepChange,
  canPublish,
  onPublish,
  submitting,
  publishLabel,
  panels,
}) {
  useEffect(() => {
    document.documentElement.dataset.theme = 'hyper';
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, []);

  const stepCount = panels.length;
  const isLastStep = step === stepCount - 1;

  function panelState(index) {
    if (index === step) return 'active';
    return index > step ? 'ahead' : 'behind';
  }

  return (
    <div className={styles.wizard}>
      <BootSequence />

      <WizardHeader
        baseUrl={baseUrl}
        rallyName={rallyName}
        credentialsSaved={credentialsSaved}
        credentialsUsername={credentialsUsername}
        credentialsSlot={credentialsSlot}
        sidebarOpen={sidebarOpen}
        onOpenSidebar={onOpenSidebar}
      />

      <main className={styles.stage}>
        {panels.map((panel, index) => (
          <section
            key={stepTitles[index]}
            className={styles.panel}
            data-panel-state={panelState(index)}
            aria-hidden={index !== step}
          >
            <div className={styles.panelInner}>{panel}</div>
          </section>
        ))}
      </main>

      <WizardFooter
        step={step}
        stepCount={stepCount}
        stepTitle={stepTitles[step]}
        stepTitles={stepTitles}
        stepNote={stepNotes?.[step]}
        onBack={() => onStepChange(Math.max(0, step - 1))}
        onNext={() => onStepChange(Math.min(stepCount - 1, step + 1))}
        onStepChange={onStepChange}
        isLastStep={isLastStep}
        onPublish={onPublish}
        canPublish={canPublish}
        submitting={submitting}
        publishLabel={publishLabel}
      />
    </div>
  );
}
