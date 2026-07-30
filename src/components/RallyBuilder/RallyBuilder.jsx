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
  createDefaultStageConfig,
  createDefaultLegConfig,
  distributeStagesEvenly,
  computeLegStageRanges,
  normalizeLastStageService,
} from '../../lib/rallyPlan.js';
import { RallyBasicsForm } from '../RallyBasicsForm/RallyBasicsForm.jsx';
import { CarGroupPicker } from '../CarGroupPicker/CarGroupPicker.jsx';
import { RoadBook } from '../RoadBook/RoadBook.jsx';
import { JobProgress } from '../JobProgress/JobProgress.jsx';
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

          // Initialize stagePlan and legSchedule with defaults (2 stages, 1 leg)
          const defaultStageConfigs = Array.from({ length: 2 }, () => createDefaultStageConfig());
          updateStagePlan(defaultStageConfigs);

          const [legStageCount] = distributeStagesEvenly(2, 1);
          setLegSchedule([createDefaultLegConfig(legStageCount)]);
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

  // Keep stagePlan in sync with rallyBasics.stages
  useEffect(() => {
    setStagePlan((prev) => {
      const newLength = rallyBasics.stages;
      if (prev.length === newLength) return prev;

      const next =
        newLength > prev.length
          ? [...prev, ...Array.from({ length: newLength - prev.length }, () => createDefaultStageConfig())]
          : prev.slice(0, newLength);

      return normalizeLastStageService(next);
    });
  }, [rallyBasics.stages]);

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

  // Manual (non-drag) leg-boundary control: each leg carries its own
  // stage_count, editable by the user (see the "Stages in this leg" input
  // below), and start_stage_no is derived from the cumulative counts at
  // render/submit time (computeLegStageRanges) rather than stored here.
  // This effect only auto-redistributes stages evenly across legs when the
  // counts don't already add up to the total -- i.e. right after the leg
  // count or total stage count changes -- so it never clobbers a manual
  // per-leg edit that already sums correctly.
  useEffect(() => {
    setLegSchedule((prev) => {
      if (prev.length === 0) return prev;
      const totalStages = stagePlan.length;
      const currentSum = prev.reduce((sum, leg) => sum + (leg.stage_count || 0), 0);
      if (currentSum === totalStages) return prev;

      const counts = distributeStagesEvenly(totalStages, prev.length);
      return prev.map((leg, i) => ({ ...leg, stage_count: counts[i] }));
    });
  }, [stagePlan.length, legSchedule.length]);

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
    if (!rallyBasics.rally_name.trim()) {
      alert('Rally name is required');
      return;
    }

    if (carGroupIds.length === 0) {
      alert('Select at least one car group');
      return;
    }

    if (stagePlan.length !== rallyBasics.stages) {
      alert('Stage count mismatch');
      return;
    }

    if (stagePlan.some((s) => !s.stage_id)) {
      alert('Every stage slot needs a stage assigned -- drag one in from the catalog.');
      return;
    }

    const legRanges = computeLegStageRanges(legSchedule);
    const assignedStages = legRanges.length > 0 ? legRanges[legRanges.length - 1].endIndex : 0;
    if (assignedStages !== stagePlan.length) {
      alert(
        `Leg "stages in this leg" counts add up to ${assignedStages}, but the rally has ${stagePlan.length} stages. Adjust each leg's stage count so they add up to the total.`
      );
      return;
    }

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
  const allStagesAssigned = stagePlan.every((s) => s.stage_id);

  const canSubmit =
    !submitting &&
    rallyBasics.rally_name.trim() &&
    carGroupIds.length > 0 &&
    stagePlan.length === rallyBasics.stages &&
    legStagesBalanced &&
    allStagesAssigned;

  function handleLegFieldChange(legIndex, field, value) {
    const newLegs = [...legSchedule];
    newLegs[legIndex] = { ...newLegs[legIndex], [field]: value };
    setLegSchedule(newLegs);
  }

  return (
    <div className={styles.container}>
      <RallyBasicsForm value={rallyBasics} onChange={setRallyBasics} options={rallyOptions} />

      <CarGroupPicker
        carGroups={carGroups}
        cars={cars}
        selectedIds={carGroupIds}
        onChange={setCarGroupIds}
      />

      <div className={styles.stagesSection}>
        <h3>Road book</h3>

        {!legStagesBalanced && (
          <p className={styles.legWarning}>
            Leg stage counts add up to {assignedStages}, but the rally has {stagePlan.length}{' '}
            stages. Adjust "Stages in this leg" below, or drag a stage across a leg divider, so
            they add up to the total.
          </p>
        )}
        {legStagesBalanced && !allStagesAssigned && (
          <p className={styles.legWarning}>
            Some stage slots are still empty -- drag a stage onto each one from the catalog panel.
          </p>
        )}

        <RoadBook
          stages={stages}
          options={rallyOptions}
          stagePlan={stagePlan}
          legSchedule={legSchedule}
          onStagePlanChange={updateStagePlan}
          onLegScheduleChange={setLegSchedule}
          onLegFieldChange={handleLegFieldChange}
        />
      </div>

      <div className={styles.actions}>
        <button
          className={styles.submitButton}
          onClick={handleCreateRally}
          disabled={!canSubmit}
        >
          {submitting ? 'Creating rally...' : 'Create Rally'}
        </button>
      </div>

      {job && <JobProgress job={job} />}
    </div>
  );
}
