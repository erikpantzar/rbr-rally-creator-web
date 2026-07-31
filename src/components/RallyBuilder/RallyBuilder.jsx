import { useEffect, useState } from 'react';
import {
  getStages,
  getCarGroups,
  getCars,
  getRallyOptions,
  createRally,
  getJobStatus,
} from '../../lib/rallyApi.js';
import {
  createDefaultLegConfig,
  computeLegStageRanges,
  normalizeLastStageService,
  cloneStageConfigWithNewUid,
  toDatetimeLocalValue,
  MAX_LEG_SPAN_DAYS,
} from '../../lib/rallyPlan.js';
import { loadRallyDraft, saveRallyDraft, clearRallyDraft } from '../../lib/rallyDraft.js';
import { RallyBasicsForm } from '../RallyBasicsForm/RallyBasicsForm.jsx';
import { CarGroupPicker } from '../CarGroupPicker/CarGroupPicker.jsx';
import { RoadBook } from '../RoadBook/RoadBook.jsx';
import { JobProgress } from '../JobProgress/JobProgress.jsx';
import { ReadinessBanner } from '../ReadinessBanner/ReadinessBanner.jsx';
import styles from './RallyBuilder.module.css';

// Matches index.html's <title> -- used as the "at rest" tab title that the
// progress/blink effect below always restores once it's done doing its
// thing (job finished + tab refocused, or the component unmounts mid-job).
const BASE_TITLE = 'RBR Rally Creator';

const TERMINAL_JOB_STATUSES = new Set([
  'succeeded',
  'succeeded_dry_run',
  'succeeded_unconfirmed',
  'failed',
]);

export function RallyBuilder({ baseUrl, credentialsSaved }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stages, setStages] = useState([]);
  const [carGroups, setCarGroups] = useState([]);
  const [cars, setCars] = useState([]);
  const [rallyOptions, setRallyOptions] = useState(null);

  const [rallyBasics, setRallyBasics] = useState({
    rally_name: '',
    description: '',
    damage_id: '2',
    stages: 2,
    legs: 1,
    pacenotes_options: 'Normal Pacenotes',
    hidden_stage_name: false,
    road_side_service: 'no',
    password1: '',
    password2: '',
  });

  const [carGroupIds, setCarGroupIds] = useState([]);
  const [stagePlan, setStagePlan] = useState([]);
  const [legSchedule, setLegSchedule] = useState([]);

  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [dryRun, setDryRun] = useState(false);

  // Every stagePlan mutation funnels through here so the "service disabled
  // on the rally's final stage" business rule (confirmed live against the
  // real site, see rbr-rally-creator-service's discovery) is always
  // reflected in state -- whichever stage ends up last (after add/remove,
  // or a drag that reorders/moves stages across a leg boundary) has its
  // service fields forced back to "No Service" rather than silently
  // retaining a full-service config the site would drop on save anyway.
  function updateStagePlan(next) {
    setStagePlan(normalizeLastStageService(next));
  }

  // Initialize catalog data (stages, car groups, individual cars) and the
  // shared rally-options enum lists on mount.
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [stagesRes, groupsRes, carsRes, optionsRes] = await Promise.all([
          getStages(baseUrl),
          getCarGroups(baseUrl),
          getCars(baseUrl),
          getRallyOptions(baseUrl),
        ]);

        if (stagesRes.ok && groupsRes.ok && carsRes.ok && optionsRes.ok) {
          setStages(stagesRes.data || []);
          setCarGroups(groupsRes.data || []);
          setCars(carsRes.data || []);
          setRallyOptions(optionsRes);

          // Resume an in-progress build (rbr-rally-creator-web#6) if one was
          // left behind by an accidental refresh/close, instead of always
          // starting from the empty-document defaults below. Each field is
          // restored independently and only if it looks like the right
          // shape, so a partial/corrupted draft can't crash the app --
          // whatever's missing just falls back to its normal default.
          const draft = loadRallyDraft();
          if (draft?.rallyBasics) setRallyBasics(draft.rallyBasics);
          if (Array.isArray(draft?.carGroupIds)) setCarGroupIds(draft.carGroupIds);
          if (Array.isArray(draft?.stagePlan)) {
            setStagePlan(normalizeLastStageService(draft.stagePlan));
          }

          if (Array.isArray(draft?.legSchedule) && draft.legSchedule.length > 0) {
            setLegSchedule(draft.legSchedule);
          } else {
            // Empty document per DESIGN_SPEC.md: start with zero stages and
            // a single empty Leg 1, not pre-seeded placeholder slots --
            // bricks only get added via the "+ Add stage" modal from here
            // on.
            setLegSchedule([createDefaultLegConfig(0)]);
          }
        } else {
          setError('Failed to fetch catalog data');
        }
      } catch (err) {
        setError(`Error loading data: ${err.message}`);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [baseUrl]);

  // rallyBasics.stages used to be a manual number input that drove
  // stagePlan's length (pre-seeding that many empty slots). Per
  // DESIGN_SPEC.md's "Lego bits" model, the road book is additive -- bricks
  // are created one at a time via the "+ Add stage" modal, and stagePlan's
  // length is whatever that produces. So this relationship is now inverted:
  // rallyBasics.stages is DERIVED from the actual brick count, kept in sync
  // here whenever stagePlan changes, rather than the other way around.
  // RallyBasicsForm's "Stages" field is now a read-only display of this
  // count, not an editable control.
  useEffect(() => {
    setRallyBasics((prev) => (prev.stages === stagePlan.length ? prev : { ...prev, stages: stagePlan.length }));
  }, [stagePlan.length]);

  // rallyBasics.legs used to be a manual number input that drove
  // legSchedule's length (pre-sizing that many leg slots). Per
  // DESIGN_SPEC.md's "Lego bits" model (rbr-rally-creator-web#15), the road
  // book is additive here too -- legs are added one at a time via the
  // "+ Add Leg" button (see handleAddLeg / RoadBook), and legSchedule's
  // length is whatever that produces. So this relationship is now inverted,
  // exactly mirroring the stagePlan.length -> rallyBasics.stages effect
  // above: rallyBasics.legs is DERIVED from the actual leg count.
  // RallyBasicsForm's "Legs" field is now a read-only display of this
  // count, not an editable control.
  useEffect(() => {
    setRallyBasics((prev) => (prev.legs === legSchedule.length ? prev : { ...prev, legs: legSchedule.length }));
  }, [legSchedule.length]);

  // Poll job status when jobId is set
  useEffect(() => {
    if (!jobId) return;

    const interval = setInterval(async () => {
      const res = await getJobStatus(baseUrl, jobId);
      if (res.ok) {
        // The job-status response doesn't necessarily echo back whether this
        // was a dry run while it's still queued/running (only the eventual
        // succeeded_dry_run result shape is guaranteed to) -- carry forward
        // the flag we already know locally from submission time so the
        // in-progress screen can label itself correctly throughout, not just
        // once it finishes.
        setJob((prev) => ({ ...res, dryRunRequested: prev?.dryRunRequested }));
        if (
          res.status === 'succeeded' ||
          res.status === 'succeeded_unconfirmed' ||
          res.status === 'succeeded_dry_run' ||
          res.status === 'failed'
        ) {
          clearInterval(interval);
          setSubmitting(false);
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId, baseUrl]);

  // rbr-rally-creator-web#17: reflect job progress in the browser tab title
  // so the user can switch to another tab instead of babysitting this one.
  // While queued/running, the title shows a live percentage; once the job
  // reaches a terminal state (success, dry-run success, unconfirmed, or
  // failure alike -- the user still wants to know it's done even if it
  // didn't fully succeed) the title blinks between a "finished" message and
  // the normal title until the user comes back to the tab (visibilitychange
  // / focus), or a fallback timeout gives up waiting for that.
  useEffect(() => {
    if (!job) return undefined;

    if (job.status === 'queued' || job.status === 'running') {
      const { stepIndex = 0, stepCount = 1 } = job.progress || {};
      const percent = stepCount > 0 ? Math.round((stepIndex / stepCount) * 100) : 0;
      document.title = `${percent}% - ${BASE_TITLE}`;
      return () => {
        document.title = BASE_TITLE;
      };
    }

    if (TERMINAL_JOB_STATUSES.has(job.status)) {
      const doneTitle = job.status === 'failed' ? '❌ Rally job failed' : '✅ Rally created!';

      let blinkOn = true;
      document.title = doneTitle;
      const blinkInterval = setInterval(() => {
        blinkOn = !blinkOn;
        document.title = blinkOn ? doneTitle : BASE_TITLE;
      }, 800);

      const stopBlinking = () => {
        clearInterval(blinkInterval);
        clearTimeout(fallbackTimeout);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('focus', stopBlinking);
        document.title = BASE_TITLE;
      };

      function handleVisibilityChange() {
        if (!document.hidden) stopBlinking();
      }

      // Fallback in case the user never comes back to this tab -- don't
      // blink forever.
      const fallbackTimeout = setTimeout(stopBlinking, 2 * 60 * 1000);

      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('focus', stopBlinking);

      return stopBlinking;
    }

    return undefined;
  }, [job]);

  // Persist the in-progress build to localStorage as the user edits it
  // (rbr-rally-creator-web#6), debounced so a burst of keystrokes/drags
  // doesn't hit localStorage on every one. Guarded on `loading` so this
  // can't fire with the pre-fetch empty defaults and clobber a real draft
  // before the restore effect above has run; guarded on `locked` so a
  // successfully-created rally's document (frozen anyway, see the
  // fieldset below) doesn't keep re-saving after the clear effect below
  // has already dropped it.
  useEffect(() => {
    if (loading || job?.status === 'succeeded') return;
    const timeout = setTimeout(() => {
      saveRallyDraft({ rallyBasics, carGroupIds, stagePlan, legSchedule });
    }, 400);
    return () => clearTimeout(timeout);
  }, [loading, job?.status, rallyBasics, carGroupIds, stagePlan, legSchedule]);

  // Once a rally has actually been created, the draft has done its job --
  // drop it so the next visit starts fresh rather than resurrecting a
  // now-submitted build. "Duplicate as new draft" (below) starts persisting
  // its own new draft the moment it changes state.
  useEffect(() => {
    if (job?.status === 'succeeded') clearRallyDraft();
  }, [job?.status]);

  async function handleCreateRally() {
    // Pre-submit validation (rally name, car groups, stage count, leg/stage
    // sync) is surfaced proactively by ReadinessBanner and gates canSubmit
    // (button disabled) -- this function only runs once canSubmit is true,
    // so no need to re-check/alert() those cases here. Only genuine
    // runtime/network failures below still use alert().
    const legRanges = computeLegStageRanges(legSchedule);

    // Only open_time/close_time/super_rally/start_stage_no are part of the
    // shared payload contract -- stage_count is a frontend-only control for
    // deriving start_stage_no, not sent to the service.
    const legSchedulePayload = legSchedule.map((leg, i) => ({
      open_time: leg.open_time,
      close_time: leg.close_time,
      super_rally: leg.super_rally,
      start_stage_no: legRanges[i].startStageNo,
    }));

    // _uid is a client-only drag-and-drop identity (see lib/rallyPlan.js) --
    // strip it so the submitted payload shape is exactly what it was before
    // Phase 3, unchanged from what the service validates against.
    const stagePlanPayload = stagePlan.map(({ _uid, ...rest }) => rest);

    const config = {
      rallyBasics,
      carGroupIds,
      legSchedule: legSchedulePayload,
      stagePlan: stagePlanPayload,
      ...(dryRun ? { dryRun: true } : {}),
    };

    setSubmitting(true);
    const res = await createRally(baseUrl, config);

    if (res.ok) {
      setJobId(res.jobId);
      setJob({
        jobId: res.jobId,
        status: res.status,
        progress: { stepIndex: 0, stepCount: 1, currentStepLabel: 'Starting...' },
        dryRunRequested: dryRun,
      });
    } else if (res.status === 401) {
      alert('Not authenticated. Please save your credentials first.');
      setSubmitting(false);
    } else if (res.status === 400) {
      const details = res.details || ['Unknown error'];
      alert(`Validation error:\n\n${details.join('\n')}`);
      setSubmitting(false);
    } else {
      alert('Error creating rally');
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className={styles.container}>Loading catalog...</div>;
  }

  if (error) {
    return <div className={styles.container}>{error}</div>;
  }

  const legRanges = computeLegStageRanges(legSchedule);
  const assignedStages = legRanges.length > 0 ? legRanges[legRanges.length - 1].endIndex : 0;
  const legStagesBalanced = assignedStages === stagePlan.length;
  // Per rbr-rally-creator-web#15: legs are now added freely via "+ Add Leg",
  // so it's easy to end up with a leg nobody has put a stage into yet -- that
  // wouldn't count as valid to publish, per the issue's own wording.
  const emptyLegNumbers = legRanges
    .map(({ startIndex, endIndex }, i) => (endIndex - startIndex === 0 ? i + 1 : null))
    .filter((n) => n !== null);

  const canSubmit =
    !submitting &&
    credentialsSaved &&
    rallyBasics.rally_name.trim() &&
    carGroupIds.length > 0 &&
    stagePlan.length > 0 &&
    legStagesBalanced &&
    emptyLegNumbers.length === 0;

  // Every pre-submit problem the old alert()s/.legWarning used to catch,
  // collected into one list for ReadinessBanner. Note: "some stage slots
  // are still empty" isn't a reachable case any more -- stagePlan entries
  // only ever get created by RoadBook's modal flow, which requires a
  // stage_id to be picked before Save is enabled (see
  // StageConfigModal's `disabled={!draft.stage_id}`), so there's no path
  // to a brick without one.
  const readinessProblems = [];
  if (!credentialsSaved) {
    readinessProblems.push('Save your rallysimfans.hu credentials above before creating a rally.');
  }
  if (!rallyBasics.rally_name.trim()) {
    readinessProblems.push('Rally name is required.');
  }
  if (carGroupIds.length === 0) {
    readinessProblems.push('Select at least one car group.');
  }
  if (stagePlan.length === 0) {
    readinessProblems.push('Add at least one stage before creating the rally.');
  }
  if (!legStagesBalanced) {
    readinessProblems.push(
      `Leg stage counts add up to ${assignedStages}, but the rally has ${stagePlan.length} stages — drag a stage across a leg divider to move it into the right leg.`
    );
  }
  if (emptyLegNumbers.length > 0) {
    const legWord = emptyLegNumbers.length === 1 ? 'Leg' : 'Legs';
    readinessProblems.push(
      `${legWord} ${emptyLegNumbers.join(', ')} ${emptyLegNumbers.length === 1 ? 'has' : 'have'} no stages — add at least one stage to every leg (or remove the empty one).`
    );
  }

  // The site itself caps a leg's open->close window at 7 days; this app
  // enforces 6 to stay safely inside that limit. Whichever date field just
  // changed, clamp close_time back down if it now exceeds open_time + 6
  // days, rather than only warning after the fact.
  function handleLegFieldChange(legIndex, field, value) {
    const newLegs = [...legSchedule];
    let updatedLeg = { ...newLegs[legIndex], [field]: value };

    if ((field === 'open_time' || field === 'close_time') && updatedLeg.open_time && updatedLeg.close_time) {
      const openDate = new Date(updatedLeg.open_time);
      const closeDate = new Date(updatedLeg.close_time);
      const maxCloseDate = new Date(openDate);
      maxCloseDate.setDate(maxCloseDate.getDate() + MAX_LEG_SPAN_DAYS);

      if (closeDate > maxCloseDate) {
        updatedLeg = { ...updatedLeg, close_time: toDatetimeLocalValue(maxCloseDate) };
      }
    }

    newLegs[legIndex] = updatedLeg;
    setLegSchedule(newLegs);
  }

  // Per rbr-rally-creator-web#15: legs are now "Lego bits" too -- appended
  // one at a time from RoadBook's "+ Add Leg" button, same additive model as
  // stages, rather than pre-sized by the old rallyBasics.legs number input.
  // The new leg starts with stage_count: 0 (empty), same as
  // createDefaultLegConfig's default -- the readinessProblems check above
  // flags it until at least one stage gets added to it.
  function handleAddLeg() {
    setLegSchedule([...legSchedule, createDefaultLegConfig(0)]);
  }

  // "Duplicate as new draft" per DESIGN_SPEC.md's UX review note: once
  // locked, cloning the current config into a fresh editable document is a
  // pure client-side state reset -- no API call, no touching the live rally
  // on rallysimfans.hu. rallyBasics/carGroupIds/legSchedule carry no
  // client-only identity so they're left as-is; stagePlan entries do (their
  // _uid is drag-and-drop keying, see lib/rallyPlan.js), so each gets a
  // fresh one via the same helper the brick "Duplicate" action uses --
  // otherwise the new draft would start with duplicate dnd-kit ids.
  function handleDuplicateAsNewDraft() {
    setStagePlan(stagePlan.map(cloneStageConfigWithNewUid));
    setJobId(null);
    setJob(null);
    setSubmitting(false);
  }

  const locked = job?.status === 'succeeded';

  return (
    <div className={styles.container}>
      {/* The document: header block through Leg N, one continuous flow.
          Job progress (below) is a deliberately separate screen/step-list,
          not layered onto this -- see DESIGN_SPEC.md "Job progress:
          separate screen". */}
      <div className={styles.document}>
        {/* Once locked, the header block's fields have nothing left to
            submit -- wrapping RallyBasicsForm/CarGroupPicker in a plain
            disabled fieldset freezes every input without needing either
            component to know about "locked" itself (native fieldset
            disabling cascades to all descendant form controls). */}
        <fieldset className={styles.headerBlock} disabled={locked}>
          <RallyBasicsForm value={rallyBasics} onChange={setRallyBasics} options={rallyOptions} />

          <CarGroupPicker
            carGroups={carGroups}
            cars={cars}
            selectedIds={carGroupIds}
            onChange={setCarGroupIds}
          />
        </fieldset>

        <div className={styles.stagesSection}>
          <RoadBook
            stages={stages}
            options={rallyOptions}
            stagePlan={stagePlan}
            legSchedule={legSchedule}
            onStagePlanChange={updateStagePlan}
            onLegScheduleChange={setLegSchedule}
            onLegFieldChange={handleLegFieldChange}
            onAddLeg={handleAddLeg}
            locked={locked}
          />
        </div>

        {locked ? (
          // Nothing left to submit once locked -- readiness/submit are
          // replaced by the "Duplicate as new draft" escape hatch from
          // DESIGN_SPEC.md's UX review note, rather than disappearing with
          // no replacement action.
          <div className={styles.actions}>
            <button className={styles.submitButton} onClick={handleDuplicateAsNewDraft}>
              Duplicate as new draft
            </button>
          </div>
        ) : (
          <>
            <ReadinessBanner problems={readinessProblems} />

            <div className={styles.actions}>
              <button
                className={styles.submitButton}
                onClick={handleCreateRally}
                disabled={!canSubmit}
              >
                {submitting
                  ? dryRun
                    ? 'Running test...'
                    : 'Creating rally...'
                  : 'Create Rally'}
              </button>

              <label className={styles.testRunLabel}>
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                  disabled={submitting}
                />
                Test run (validate everything, don't actually create the rally)
              </label>
            </div>
          </>
        )}
      </div>

      {job && (
        <div
          className={
            job.dryRunRequested
              ? `${styles.jobProgressScreen} ${styles.dryRunScreen}`
              : styles.jobProgressScreen
          }
        >
          <JobProgress job={job} />
        </div>
      )}
    </div>
  );
}
