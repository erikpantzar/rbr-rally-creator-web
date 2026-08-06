// In-browser stand-in for rbr-rally-creator-service, so `npm run dev` never
// talks to the real backend (or holds real rallysimfans.hu credentials) --
// local development is UI-only by default. lib/rallyApi.js and
// lib/authApi.js route through here instead of fetch() when USE_MOCK_API is
// on; the endpoint behavior below mirrors the service's real routes
// (src/routes/*.js in the sibling repo) closely enough for every UI state
// to be reachable, including the no-credentials 401 and job cancellation.
//
// To develop against the real service instead, run `npm run dev:real`
// (sets VITE_REAL_API=true). Production builds are never mocked:
// import.meta.env.DEV is statically false there, so this whole module is
// dead code in dist.
import { MOCK_STAGES, MOCK_CAR_GROUPS, MOCK_CARS, MOCK_RALLY_OPTIONS } from './mockData.js';

export const USE_MOCK_API = import.meta.env.DEV && import.meta.env.VITE_REAL_API !== 'true';

// Small artificial latency so loading/checking states actually render
// during dev instead of flashing past.
const delay = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

// --- /auth/credentials ---------------------------------------------------
// The real service holds credentials server-side behind an httpOnly cookie;
// here a module-level variable plays that role. Page refresh forgets them,
// which is fine -- it just means the credential form shows again.
let savedUsername = null;

// --- /rallies + /jobs ----------------------------------------------------
// One fake Playwright job per POST /rallies. Progress advances one step per
// GET /jobs/:id poll (RallyBuilder polls every 2s), so a full run takes
// ~15 seconds -- long enough to see the progress bar and try Cancel.
const JOB_STEPS = [
  'Logging in to rallysimfans.hu',
  'Opening the rally creation wizard',
  'Filling in rally basics',
  'Selecting car groups',
  'Configuring stages',
  'Scheduling legs',
  'Submitting the rally',
  'Confirming the created rally',
];

const jobs = new Map();
let nextJobId = 1;

function jobStatusResponse(job) {
  if (job.cancelled) {
    return { ok: true, status: 'cancelled' };
  }
  if (job.stepIndex >= JOB_STEPS.length) {
    return job.dryRun
      ? {
          ok: true,
          status: 'succeeded_dry_run',
          result: { note: 'Mock dry run -- no real backend was involved.' },
        }
      : {
          ok: true,
          status: 'succeeded',
          result: { rallyUrl: 'https://rallysimfans.hu/rbr/rally_online.php' },
        };
  }
  const response = {
    ok: true,
    status: job.stepIndex === 0 ? 'queued' : 'running',
    progress: {
      stepIndex: job.stepIndex,
      stepCount: JOB_STEPS.length,
      currentStepLabel: JOB_STEPS[job.stepIndex],
    },
  };
  job.stepIndex += 1;
  return response;
}

// Same return contract as rallyApi/authApi's request(): `{ ok: true, ... }`
// on success, `{ ok: false, status, ... }` on error.
export async function mockRequest(path, { method = 'GET', body } = {}) {
  await delay();

  if (path === '/health') {
    return { ok: true, mock: true };
  }

  if (path === '/auth/credentials') {
    if (method === 'POST') {
      if (!body?.username || !body?.password) {
        return { ok: false, status: 400, reason: 'missing_fields' };
      }
      savedUsername = body.username;
      return { ok: true, username: savedUsername };
    }
    if (method === 'DELETE') {
      savedUsername = null;
      return { ok: true };
    }
    return savedUsername ? { ok: true, username: savedUsername } : { ok: false, status: 404 };
  }

  if (path === '/catalog/rally-options') {
    return { ok: true, ...MOCK_RALLY_OPTIONS };
  }

  if (path === '/rallies' && method === 'POST') {
    if (!savedUsername) {
      return { ok: false, status: 401 };
    }
    const jobId = `mock-job-${nextJobId++}`;
    jobs.set(jobId, { stepIndex: 0, dryRun: Boolean(body?.dryRun), cancelled: false });
    return { ok: true, jobId, status: 'queued' };
  }

  const jobMatch = path.match(/^\/jobs\/(.+)$/);
  if (jobMatch) {
    const job = jobs.get(jobMatch[1]);
    if (!job) {
      return { ok: false, status: 404 };
    }
    if (method === 'DELETE') {
      job.cancelled = true;
      return { ok: true, status: 'cancelled' };
    }
    return jobStatusResponse(job);
  }

  return { ok: false, status: 404 };
}

// Same return contract as rallyApi's requestArray(): the raw catalog array
// wrapped under `.data`.
export async function mockRequestArray(path) {
  await delay();

  if (path === '/catalog/stages') return { ok: true, data: MOCK_STAGES };
  if (path === '/catalog/car-groups') return { ok: true, data: MOCK_CAR_GROUPS };
  if (path === '/catalog/cars') return { ok: true, data: MOCK_CARS };

  return { ok: false, status: 404 };
}
