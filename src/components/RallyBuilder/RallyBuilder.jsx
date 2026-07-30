import { useEffect, useState } from 'react';
import {
  getStages,
  getCarGroups,
  getCars,
  getRallyOptions,
  createRally,
  getJobStatus,
} from '../../lib/rallyApi.js';
import { RallyBasicsForm } from '../RallyBasicsForm/RallyBasicsForm.jsx';
import { CarGroupPicker } from '../CarGroupPicker/CarGroupPicker.jsx';
import { StageSlot } from '../StageSlot/StageSlot.jsx';
import { JobProgress } from '../JobProgress/JobProgress.jsx';
import styles from './RallyBuilder.module.css';

function createDefaultStageConfig(stages) {
  return {
    stage_id: stages[0]?.id ?? null,
    surface_age_id: '2',
    wetness_id: 'dry',
    tracksettings_id: 'Morning Clear Crisp',
    def_tyre_id: 'Gravel Dry',
    choose_tyre: false,
    choose_setup: false,
    service_time: '60 minutes',
    nummechanics: '6 mechanic',
    mechanicsSkill: 'Expert',
  };
}

// stage_count is the manual (non-drag) leg-boundary control: how many of
// the rally's stages fall in this leg. start_stage_no is derived from it
// (see computeLegStageRanges) rather than stored directly, so it can never
// drift out of sync with the counts a user has typed in.
function createDefaultLegConfig(stageCount = 0) {
  return {
    open_time: '',
    close_time: '',
    super_rally: 'disabled',
    stage_count: stageCount,
  };
}

// Evenly split `totalStages` across `legCount` legs (remainder stages go to
// the earliest legs) -- used only to seed/reseed defaults; a user's manual
// per-leg counts otherwise take over.
function distributeStagesEvenly(totalStages, legCount) {
  if (legCount <= 0) return [];
  const base = Math.floor(totalStages / legCount);
  const remainder = totalStages % legCount;
  return Array.from({ length: legCount }, (_, i) => base + (i < remainder ? 1 : 0));
}

// Turns each leg's stage_count into an absolute [startIndex, endIndex) slice
// range over stagePlan, plus the 1-based start_stage_no the backend expects.
function computeLegStageRanges(legSchedule) {
  let cursor = 0;
  return legSchedule.map((leg) => {
    const startIndex = cursor;
    const count = Math.max(0, leg.stage_count || 0);
    cursor += count;
    return { startIndex, endIndex: cursor, startStageNo: startIndex + 1 };
  });
}

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
          const defaultStageConfigs = Array.from({ length: 2 }, () =>
            createDefaultStageConfig(stagesRes.data || [])
          );
          setStagePlan(defaultStageConfigs);

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

      if (newLength > prev.length) {
        // Add new stages
        const newStages = Array.from({ length: newLength - prev.length }, () =>
          createDefaultStageConfig(stages)
        );
        return [...prev, ...newStages];
      } else {
        // Remove excess stages
        return prev.slice(0, newLength);
      }
    });
  }, [rallyBasics.stages, stages]);

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

    const config = {
      rallyBasics,
      carGroupIds,
      legSchedule: legSchedulePayload,
      stagePlan,
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
    stagePlan.length === rallyBasics.stages &&
    legStagesBalanced;

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
        <h3>Stages and legs</h3>

        {!legStagesBalanced && (
          <p className={styles.legWarning}>
            Leg stage counts add up to {assignedStages}, but the rally has {stagePlan.length}{' '}
            stages. Adjust "Stages in this leg" below so they add up to the total.
          </p>
        )}

        {legSchedule.map((leg, legIndex) => {
          const { startIndex: legStartStageIndex, endIndex: legEndStageIndex, startStageNo } =
            legRanges[legIndex];
          const legStages = stagePlan.slice(legStartStageIndex, legEndStageIndex);

          return (
            <div key={legIndex} className={styles.legGroup}>
              <div className={styles.legHeader}>
                <h4>
                  Leg {legIndex + 1}{' '}
                  <span className={styles.legStartStage}>(starts at stage {startStageNo})</span>
                </h4>
                <div className={styles.legInputs}>
                  <label className={styles.legFieldLabel}>
                    Stages in this leg
                    <input
                      type="number"
                      min="0"
                      max={stagePlan.length}
                      value={leg.stage_count}
                      onChange={(e) => {
                        const newLegs = [...legSchedule];
                        newLegs[legIndex] = {
                          ...leg,
                          stage_count: parseInt(e.target.value, 10) || 0,
                        };
                        setLegSchedule(newLegs);
                      }}
                    />
                  </label>
                  <input
                    type="datetime-local"
                    placeholder="Open time"
                    value={leg.open_time}
                    onChange={(e) => {
                      const newLegs = [...legSchedule];
                      newLegs[legIndex] = { ...leg, open_time: e.target.value };
                      setLegSchedule(newLegs);
                    }}
                  />
                  <input
                    type="datetime-local"
                    placeholder="Close time"
                    value={leg.close_time}
                    onChange={(e) => {
                      const newLegs = [...legSchedule];
                      newLegs[legIndex] = { ...leg, close_time: e.target.value };
                      setLegSchedule(newLegs);
                    }}
                  />
                  <select
                    value={leg.super_rally}
                    onChange={(e) => {
                      const newLegs = [...legSchedule];
                      newLegs[legIndex] = { ...leg, super_rally: e.target.value };
                      setLegSchedule(newLegs);
                    }}
                  >
                    {rallyOptions.superRally.map((opt) => (
                      <option key={opt} value={opt}>
                        Super Rally: {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.stagesList}>
                {legStages.map((stageConfig, stageIndexInLeg) => {
                  const absoluteStageIndex = legStartStageIndex + stageIndexInLeg;
                  return (
                    <StageSlot
                      key={absoluteStageIndex}
                      stages={stages}
                      value={stageConfig}
                      options={rallyOptions}
                      onChange={(updatedStage) => {
                        const newPlan = [...stagePlan];
                        newPlan[absoluteStageIndex] = updatedStage;
                        setStagePlan(newPlan);
                      }}
                      stageNumber={absoluteStageIndex + 1}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
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
