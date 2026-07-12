/** Fixed viewer API paths. Route handlers live under viewer/app/api/runs. */
export const viewerApiPaths = {
  runs: "/api/runs",
  runDocument: (runId: string) => `/api/runs/${encodeURIComponent(runId)}/document`,
  runSession: (runId: string) => `/api/runs/${encodeURIComponent(runId)}/session`,
} as const;
