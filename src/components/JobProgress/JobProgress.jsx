import styles from './JobProgress.module.css';

export function JobProgress({ job }) {
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
        <p className={styles.label}>{job.progress.currentStepLabel}</p>
        {job.progress.note && <p className={styles.note}>{job.progress.note}</p>}
        <p className={styles.percentage}>{progress}%</p>
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
        </div>
      </div>
    );
  }

  return null;
}
