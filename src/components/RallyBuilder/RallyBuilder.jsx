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
} from '../../lib/rallyPlan.js';
import { RallyBasicsForm } from '../RallyBasicsForm/RallyBasicsForm.jsx';
import { CarGroupPicker } from '../CarGroupPicker/CarGroupPicker.jsx';
import { RoadBook } from '../RoadBook/RoadBook.jsx';
import { JobProgress } from '../JobProgress/JobProgress.jsx';
import { ReadinessBanner } from '../ReadinessBanner/ReadinessBanner.jsx';
import styles from './RallyBuilder.module.css';

export function RallyBuilder({ baseUrl }) {
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

          // Empty document per DESIGN_SPEC.md: start with zero stages and a
          // single empty Leg 1, not pre-seeded placeholder slots -- bricks
          // only get added via the "+ Add stage" modal from here on.
          setLegSchedule([createDefaultLegConfig(0)]);
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

  // Keep legSchedule in sync with rallyBasics.legs (added legs start with
  // stage_count: 0 -- the rebalance effect below fills them in)
  useEffect(() => {
    setLegSchedule((prev) => {
      const newLength = rallyBasics.legs;
      if (prev.length === newLength) return prev;

      if (newLength > prev.length) {
        // Add new legs
        const newLegs = Array.from({ length: newLength - prev.length }, () =>
          createDefaultLegConfig()
        );
        return [...prev, ...newLegs];
      } else {
        // Remove excess legs
        return prev.slice(0, newLength);
      }
    });
  }, [rallyBasics.legs]);

  // Poll job status when jobId is set
  useEffect(() => {
    if (!jobId) return;

    const interval = setInterval(async () => {
      const res = await getJobStatus(baseUrl, jobId);
      if (res.ok) {
        setJob(res);
        if (
          res.status === 'succeeded' ||
          res.status === 'succeeded_unconfirmed' ||
          res.status === 'failed'
        ) {
          clearInterval(interval);
          setSubmitting(false);
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId, baseUrl]);

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
    };

    setSubmitting(true);
    const res = await createRally(baseUrl, config);

    if (res.ok) {
      setJobId(res.jobId);
      setJob({
        jobId: res.jobId,
        status: res.status,
        progress: { stepIndex: 0, stepCount: 1, currentStepLabel: 'Starting...' },
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

  const canSubmit =
    !submitting &&
    rallyBasics.rally_name.trim() &&
    carGroupIds.length > 0 &&
    stagePlan.length > 0 &&
    legStagesBalanced;

  // Every pre-submit problem the old alert()s/.legWarning used to catch,
  // collected into one list for ReadinessBanner. Note: "some stage slots
  // are still empty" isn't a reachable case any more -- stagePlan entries
  // only ever get created by RoadBook's modal flow, which requires a
  // stage_id to be picked before Save is enabled (see
  // StageConfigModal's `disabled={!draft.stage_id}`), so there's no path
  // to a brick without one.
  const readinessProblems = [];
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

  function handleLegFieldChange(legIndex, field, value) {
    const newLegs = [...legSchedule];
    newLegs[legIndex] = { ...newLegs[legIndex], [field]: value };
    setLegSchedule(newLegs);
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
                {submitting ? 'Creating rally...' : 'Create Rally'}
              </button>
            </div>
          </>
        )}
      </div>

      {job && (
        <div className={styles.jobProgressScreen}>
          <JobProgress job={job} />
        </div>
      )}
    </div>
  );
}
