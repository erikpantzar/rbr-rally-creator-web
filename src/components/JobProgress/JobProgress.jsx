import { useEffect, useRef, useState } from 'react';
import styles from './JobProgress.module.css';

// rbr-rally-creator-web#120: pulses the percentage label for a beat whenever
// a new step lands, so the HUD feels like it's actively reporting telemetry
// rather than a bar that occasionally jumps. Keyed off stepIndex rather than
// the rendered progress % since two different stepIndex values can round to
// the same %.
function useAdvancingPulse(stepIndex) {
  const [pulsing, setPulsing] = useState(false);
  const previousStepIndex = useRef(stepIndex);

  useEffect(() => {
    if (previousStepIndex.current === stepIndex) return undefined;
    previousStepIndex.current = stepIndex;
    setPulsing(true);
    const timeoutId = setTimeout(() => setPulsing(false), 600);
    return () => clearTimeout(timeoutId);
  }, [stepIndex]);

  return pulsing;
}

// rbr-rally-creator-web#31: `onCancel`/`cancelRequested` are only relevant
// while the job is still queued/running -- callers can pass them
// unconditionally, they're simply unused for every other status branch
// below.
// rbr-rally-creator-web#120: `onDismiss` is the mirror image -- only
// relevant once the job has reached a terminal state, since queued/running
// already has its own way out (Cancel). Terminal branches each render it
// with their own state's color treatment so it never reads as a neutral
// "OK" button on top of an error/warning card.
export function JobProgress({ job, onCancel, cancelRequested, onDismiss }) {
  // Called unconditionally (rules of hooks) even though the pulse only ever
  // shows up in the queued/running branch below -- job?.progress?.stepIndex
  // is undefined for every other status, so the effect inside just never
  // fires for them.
  const advancing = useAdvancingPulse(job?.progress?.stepIndex);

  if (!job) {
    return null;
  }

  if (job.status === 'queued' || job.status === 'running') {
    const progress = Math.round((job.progress.stepIndex / job.progress.stepCount) * 100);
    return (
      <div className={styles.container}>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>
        <p className={styles.label}>
          {cancelRequested ? 'Cancelling...' : job.progress.currentStepLabel}
        </p>
        {job.progress.note && !cancelRequested && <p className={styles.note}>{job.progress.note}</p>}
        <p className={advancing ? `${styles.percentage} ${styles.advancing}` : styles.percentage}>
          {progress}%
        </p>
        {onCancel && (
          // Cancel is cooperative-only (DELETE /jobs/:id) and does not wait
          // for the job to actually stop -- once requested, re-clicking does
          // nothing useful (the service is already trying), so the button
          // disables/relabels immediately rather than staying clickable.
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onCancel}
            disabled={cancelRequested}
          >
            {cancelRequested ? 'Cancelling...' : 'Cancel'}
          </button>
        )}
      </div>
    );
  }

  if (job.status === 'succeeded') {
    return (
      <div className={styles.container}>
        <div className={styles.success}>
          <h4>Rally created successfully!</h4>
          <p>
            Your rally is now live on rallysimfans.hu. View it{' '}
            <a href={job.result.rallyUrl} target="_blank" rel="noopener noreferrer">
              here
            </a>
            .
          </p>
          {onDismiss && (
            <button type="button" className={styles.dismissButtonSuccess} onClick={onDismiss}>
              Back to rally overview
            </button>
          )}
        </div>
      </div>
    );
  }

  if (job.status === 'succeeded_dry_run') {
    return (
      <div className={styles.container}>
        <div className={styles.dryRun}>
          <h4>Test run complete — no rally was created, everything validated OK</h4>
          {job.result?.note && <p>{job.result.note}</p>}
          {job.result?.finalPageUrl && (
            <p>
              <a href={job.result.finalPageUrl} target="_blank" rel="noopener noreferrer">
                View final page reached during the test
              </a>
            </p>
          )}
          {onDismiss && (
            <button type="button" className={styles.dismissButtonAmber} onClick={onDismiss}>
              Back to wizard
            </button>
          )}
        </div>
      </div>
    );
  }

  if (job.status === 'succeeded_unconfirmed') {
    return (
      <div className={styles.container}>
        <div className={styles.warning}>
          <h4>Rally may have been created</h4>
          <p>
            The rally creation process completed, but automatic confirmation failed. Please check
            the final page to verify:
          </p>
          <p>
            <a href={job.result.finalPageUrl} target="_blank" rel="noopener noreferrer">
              Check final page
            </a>
          </p>
          {job.result.bodyTextSnippet && (
            <details className={styles.details}>
              <summary>Debug snippet</summary>
              <pre className={styles.snippet}>{job.result.bodyTextSnippet}</pre>
            </details>
          )}
          {onDismiss && (
            <button type="button" className={styles.dismissButtonAmber} onClick={onDismiss}>
              Back to wizard
            </button>
          )}
        </div>
      </div>
    );
  }

  if (job.status === 'failed') {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <h4>Rally creation failed</h4>
          <p>{job.error.message}</p>
          {job.error.mayHaveCreatedPartialRally && (
            <p className={styles.warning_text}>
              This may have partially created a rally on rallysimfans.hu — check the site directly.
            </p>
          )}
          {job.error.finalPageUrl && (
            <p>
              <a href={job.error.finalPageUrl} target="_blank" rel="noopener noreferrer">
                Check final page
              </a>
            </p>
          )}
          {onDismiss && (
            <button type="button" className={styles.dismissButtonError} onClick={onDismiss}>
              Back to wizard
            </button>
          )}
        </div>
      </div>
    );
  }

  // A deliberate stop, not an error -- kept visually distinct from both
  // .success and .error (see JobProgress.module.css's neutral .cancelled
  // treatment). Still uses the same job.error shape failures do
  // (code: 'cancelled'), so the mayHaveCreatedPartialRally warning below is
  // the same honesty check as the failed branch above: per the backend
  // contract, a cancelled job can still have landed a partial rally on the
  // real site once car-group selection was submitted, and that must not be
  // glossed over just because the user asked for the cancel themselves.
  if (job.status === 'cancelled') {
    return (
      <div className={styles.container}>
        <div className={styles.cancelled}>
          <h4>Rally creation cancelled</h4>
          <p>{job.error?.message || 'The job was cancelled before it finished.'}</p>
          {job.error?.mayHaveCreatedPartialRally && (
            <p className={styles.warning_text}>
              This may have partially created a rally on rallysimfans.hu — check the site directly.
            </p>
          )}
          {job.error?.finalPageUrl && (
            <p>
              <a href={job.error.finalPageUrl} target="_blank" rel="noopener noreferrer">
                Check final page
              </a>
            </p>
          )}
          {onDismiss && (
            <button type="button" className={styles.dismissButtonNeutral} onClick={onDismiss}>
              Back to wizard
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
