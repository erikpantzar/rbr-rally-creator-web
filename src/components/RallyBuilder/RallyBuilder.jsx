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

function createDefaultLegConfig() {
  return {
    open_time: '',
    close_time: '',
    start_stage_no: 1,
    super_rally: 'disabled',
  };
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

          const defaultLegConfigs = Array.from({ length: 1 }, () =>
            createDefaultLegConfig()
          );
          setLegSchedule(defaultLegConfigs);
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

  // Keep legSchedule in sync with rallyBasics.legs
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

  // Auto-compute start_stage_no for each leg
  useEffect(() => {
    setLegSchedule((prev) => {
      const stagesPerLeg = Math.ceil(stagePlan.length / prev.length) || 1;
      return prev.map((leg, legIndex) => ({
        ...leg,
        start_stage_no: legIndex * stagesPerLeg + 1,
      }));
    });
  }, [stagePlan.length]);

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

    const config = {
      rallyBasics,
      carGroupIds,
      legSchedule,
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

  const stagesPerLeg = Math.ceil(stagePlan.length / legSchedule.length) || 1;

  const canSubmit =
    !submitting &&
    rallyBasics.rally_name.trim() &&
    carGroupIds.length > 0 &&
    stagePlan.length === rallyBasics.stages;

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

        {legSchedule.map((leg, legIndex) => {
          const legStartStageIndex = legIndex * stagesPerLeg;
          const legEndStageIndex = Math.min(
            (legIndex + 1) * stagesPerLeg,
            stagePlan.length
          );
          const legStages = stagePlan.slice(legStartStageIndex, legEndStageIndex);

          return (
            <div key={legIndex} className={styles.legGroup}>
              <div className={styles.legHeader}>
                <h4>Leg {legIndex + 1}</h4>
                <div className={styles.legInputs}>
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
