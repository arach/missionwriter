import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  isTmuxSessionAlive,
  killTmuxSession,
  listMissionWriterTmuxSessions,
} from "./tmux-control";

export type TmuxMissionEndPolicy = "detach" | "kill" | "keep";

export interface TmuxSessionPolicy {
  /** Kill the tmux session after this many ms of idle time. 0 disables auto-kill. Default: 30 minutes. */
  idleTimeoutMs?: number;
  /** What happens to tracked tmux sessions when the mw run finishes. Default: detach. */
  onMissionEnd?: TmuxMissionEndPolicy;
}

export interface ResolvedTmuxSessionPolicy {
  idleTimeoutMs: number;
  onMissionEnd: TmuxMissionEndPolicy;
}

export type TmuxTimelineEventType =
  | "created"
  | "ready"
  | "reused"
  | "prompt-sent"
  | "turn-complete"
  | "idle-scheduled"
  | "idle-expired"
  | "detached"
  | "killed"
  | "mission-end"
  | "compact"
  | "clear"
  | "attach";

export interface TmuxTimelineEvent {
  at: string;
  type: TmuxTimelineEventType;
  contributorId: string;
  sessionName: string;
  detail?: string;
}

export interface TmuxSessionLease {
  key: string;
  contributorId: string;
  sessionName: string;
  reused: boolean;
}

type TmuxSessionState = "spawning" | "ready" | "busy" | "idle";

interface TrackedTmuxSession {
  key: string;
  contributorId: string;
  sessionName: string;
  cwd: string;
  model: string;
  state: TmuxSessionState;
  createdAt: number;
  lastActiveAt: number;
  policy: ResolvedTmuxSessionPolicy;
  timeline: TmuxTimelineEvent[];
  idleTimer: ReturnType<typeof setTimeout> | null;
}

const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_ON_MISSION_END: TmuxMissionEndPolicy = "detach";

export interface TmuxSessionSummary {
  contributorId: string;
  sessionName: string;
  cwd?: string;
  model?: string;
  state: TmuxSessionState | "unknown";
  alive: boolean;
  createdAt?: string;
  lastActiveAt?: string;
  attach: string;
}

interface PersistedTmuxSession {
  contributorId: string;
  sessionName: string;
  cwd?: string;
  model?: string;
  state: TmuxSessionState | "unknown";
  createdAt?: string;
  lastActiveAt?: string;
  timeline: TmuxTimelineEvent[];
}

interface PersistedTmuxState {
  updatedAt: string;
  sessions: PersistedTmuxSession[];
}

const registry = {
  defaultPolicy: defaultResolvedPolicy(),
  sessions: new Map<string, TrackedTmuxSession>(),
};

function missionWriterDir(): string {
  return join(homedir(), ".missionwriter");
}

function tmuxSessionsPath(): string {
  return join(missionWriterDir(), "tmux-sessions.json");
}

function tmuxTimelinePath(): string {
  return join(missionWriterDir(), "tmux-timeline.json");
}

export function defaultResolvedPolicy(overrides?: TmuxSessionPolicy): ResolvedTmuxSessionPolicy {
  return {
    idleTimeoutMs: overrides?.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
    onMissionEnd: overrides?.onMissionEnd ?? DEFAULT_ON_MISSION_END,
  };
}

export function mergeTmuxPolicy(
  missionPolicy?: TmuxSessionPolicy,
  contributorPolicy?: TmuxSessionPolicy,
): ResolvedTmuxSessionPolicy {
  return defaultResolvedPolicy({
    ...missionPolicy,
    ...contributorPolicy,
  });
}

export function setTmuxDefaultPolicy(policy: ResolvedTmuxSessionPolicy): void {
  registry.defaultPolicy = policy;
}

export function buildTmuxSessionKey(contributorId: string, cwd: string, model: string): string {
  return `${contributorId}\0${cwd}\0${model}`;
}

export function buildTmuxSessionName(contributorId: string): string {
  return normalizeTmuxSessionName(`mw-${contributorId}`);
}

export function acquireTmuxSession(input: {
  contributorId: string;
  cwd: string;
  model: string;
  policy?: ResolvedTmuxSessionPolicy;
}): TmuxSessionLease {
  const policy = input.policy ?? registry.defaultPolicy;
  const key = buildTmuxSessionKey(input.contributorId, input.cwd, input.model);
  const sessionName = buildTmuxSessionName(input.contributorId);
  const existing = registry.sessions.get(key);

  if (existing && isTmuxSessionAlive(existing.sessionName)) {
    clearIdleTimer(existing);
    existing.state = "busy";
    existing.lastActiveAt = Date.now();
    recordEvent(existing, "reused", `attach with: tmux attach -t ${existing.sessionName}`);
    logTimeline(existing, "reused");
    void persistTmuxState();
    return {
      key,
      contributorId: input.contributorId,
      sessionName: existing.sessionName,
      reused: true,
    };
  }

  if (existing) {
    registry.sessions.delete(key);
  }

  const tracked: TrackedTmuxSession = {
    key,
    contributorId: input.contributorId,
    sessionName,
    cwd: input.cwd,
    model: input.model,
    state: "spawning",
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    policy,
    timeline: [],
    idleTimer: null,
  };
  registry.sessions.set(key, tracked);
  recordEvent(tracked, "created");
  logTimeline(tracked, "created");
  void persistTmuxState();

  return {
    key,
    contributorId: input.contributorId,
    sessionName,
    reused: false,
  };
}

export function markTmuxSessionReady(key: string): void {
  const tracked = requireTrackedSession(key);
  tracked.state = "ready";
  tracked.lastActiveAt = Date.now();
  recordEvent(tracked, "ready");
  logTimeline(tracked, "ready");
  void persistTmuxState();
}

export function markTmuxPromptSent(key: string): void {
  const tracked = requireTrackedSession(key);
  tracked.state = "busy";
  tracked.lastActiveAt = Date.now();
  recordEvent(tracked, "prompt-sent");
  logTimeline(tracked, "prompt-sent");
  void persistTmuxState();
}

export function completeTmuxTurn(key: string): void {
  const tracked = requireTrackedSession(key);
  tracked.state = "idle";
  tracked.lastActiveAt = Date.now();
  recordEvent(tracked, "turn-complete");
  logTimeline(tracked, "turn-complete");
  scheduleIdleTimeout(tracked);
  void persistTmuxState();
}

export function killTrackedTmuxSession(key: string, reason = "manual"): void {
  const tracked = registry.sessions.get(key);
  if (!tracked) return;

  clearIdleTimer(tracked);
  killTmuxSession(tracked.sessionName);
  recordEvent(tracked, "killed", reason);
  logTimeline(tracked, "killed", reason);
  registry.sessions.delete(key);
  void persistTmuxState();
}

export async function finalizeTmuxSessions(policyOverride?: ResolvedTmuxSessionPolicy): Promise<void> {
  const sessions = [...registry.sessions.values()];
  if (sessions.length === 0) return;

  const timeline = getTmuxTimeline();
  await persistTmuxTimeline(timeline);

  for (const tracked of sessions) {
    const policy = policyOverride ?? tracked.policy;
    clearIdleTimer(tracked);

    if (policy.onMissionEnd === "kill") {
      killTmuxSession(tracked.sessionName);
      recordEvent(tracked, "killed", "mission-end");
      logTimeline(tracked, "mission-end", "killed");
      registry.sessions.delete(tracked.key);
      continue;
    }

    recordEvent(tracked, "mission-end", policy.onMissionEnd);
    logTimeline(
      tracked,
      policy.onMissionEnd === "detach" ? "detached" : "mission-end",
      policy.onMissionEnd === "detach"
        ? `tmux attach -t ${tracked.sessionName}`
        : policy.onMissionEnd,
    );

    if (policy.onMissionEnd === "detach" || policy.onMissionEnd === "keep") {
      scheduleDetachedIdleKill(tracked);
    }
  }

  if (policyOverride?.onMissionEnd === "kill") {
    registry.sessions.clear();
  }

  await persistTmuxState();
}

export function getTmuxTimeline(): TmuxTimelineEvent[] {
  return [...registry.sessions.values()]
    .flatMap(session => session.timeline)
    .sort((left, right) => left.at.localeCompare(right.at));
}

export function listTrackedTmuxSessions(): TmuxSessionSummary[] {
  return [...registry.sessions.values()].map(session => toSessionSummary(session));
}

export function resolveTmuxSessionName(target: string): string {
  const trimmed = target.trim();
  if (!trimmed) {
    throw new Error("session target is required");
  }
  if (trimmed.startsWith("mw-")) {
    return normalizeTmuxSessionName(trimmed);
  }
  return buildTmuxSessionName(trimmed);
}

export function contributorIdFromSessionName(sessionName: string): string {
  return sessionName.startsWith("mw-") ? sessionName.slice(3) : sessionName;
}

export async function listTmuxSessionCatalog(options?: { includeDead?: boolean }): Promise<TmuxSessionSummary[]> {
  const persisted = await loadPersistedTmuxState();
  const live = listMissionWriterTmuxSessions();
  const merged = new Map<string, TmuxSessionSummary>();

  for (const session of persisted.sessions) {
    merged.set(session.sessionName, {
      contributorId: session.contributorId,
      sessionName: session.sessionName,
      cwd: session.cwd,
      model: session.model,
      state: session.state,
      alive: false,
      createdAt: session.createdAt,
      lastActiveAt: session.lastActiveAt,
      attach: `tmux attach -t ${session.sessionName}`,
    });
  }

  for (const tracked of registry.sessions.values()) {
    merged.set(tracked.sessionName, toSessionSummary(tracked));
  }

  for (const liveSession of live) {
    const existing = merged.get(liveSession.sessionName);
    const contributorId = contributorIdFromSessionName(liveSession.sessionName);
    merged.set(liveSession.sessionName, {
      contributorId: existing?.contributorId ?? contributorId,
      sessionName: liveSession.sessionName,
      cwd: existing?.cwd,
      model: existing?.model,
      state: existing?.state ?? "unknown",
      alive: true,
      createdAt: existing?.createdAt ?? liveSession.createdAt,
      lastActiveAt: existing?.lastActiveAt,
      attach: `tmux attach -t ${liveSession.sessionName}`,
    });
  }

  for (const [sessionName, summary] of merged) {
    summary.alive = isTmuxSessionAlive(sessionName);
  }

  const sessions = [...merged.values()].sort((left, right) =>
    left.sessionName.localeCompare(right.sessionName),
  );

  return options?.includeDead ? sessions : sessions.filter(session => session.alive);
}

export async function removePersistedTmuxSession(sessionName: string): Promise<void> {
  const persisted = await loadPersistedTmuxState();
  const nextSessions = persisted.sessions.filter(session => session.sessionName !== sessionName);
  if (nextSessions.length === persisted.sessions.length) {
    return;
  }
  await writePersistedTmuxState({
    updatedAt: new Date().toISOString(),
    sessions: nextSessions,
  });
}

export async function recordTmuxSessionAction(
  sessionName: string,
  type: Extract<TmuxTimelineEventType, "compact" | "clear" | "attach" | "killed">,
  detail?: string,
): Promise<void> {
  const contributorId = contributorIdFromSessionName(sessionName);
  const tracked = [...registry.sessions.values()].find(session => session.sessionName === sessionName);
  if (tracked) {
    recordEvent(tracked, type, detail);
    logTimeline(tracked, type, detail);
    void persistTmuxState();
    return;
  }

  const persisted = await loadPersistedTmuxState();
  const entry = persisted.sessions.find(session => session.sessionName === sessionName) ?? {
    contributorId,
    sessionName,
    state: "unknown" as const,
    timeline: [] as TmuxTimelineEvent[],
  };
  entry.timeline.push({
    at: new Date().toISOString(),
    type,
    contributorId,
    sessionName,
    detail,
  });
  entry.lastActiveAt = new Date().toISOString();
  const others = persisted.sessions.filter(session => session.sessionName !== sessionName);
  persisted.sessions = [...others, entry];
  persisted.updatedAt = new Date().toISOString();
  await writePersistedTmuxState(persisted);
  console.error(`[mw:tmux] ${contributorId} ${sessionName} ${type}${detail ? ` (${detail})` : ""}`);
}

export async function loadPersistedTmuxTimeline(target?: string): Promise<TmuxTimelineEvent[]> {
  const sessionName = target ? resolveTmuxSessionName(target) : undefined;
  const inMemory = getTmuxTimeline();
  const persisted = await loadPersistedTmuxState();
  const fromDisk = persisted.sessions
    .flatMap(session => session.timeline)
    .filter(event => !sessionName || event.sessionName === sessionName);

  return [...inMemory, ...fromDisk]
    .sort((left, right) => left.at.localeCompare(right.at));
}

function requireTrackedSession(key: string): TrackedTmuxSession {
  const tracked = registry.sessions.get(key);
  if (!tracked) {
    throw new Error(`tmux session registry missing key ${key}`);
  }
  return tracked;
}

function scheduleIdleTimeout(tracked: TrackedTmuxSession): void {
  clearIdleTimer(tracked);

  const idleTimeoutMs = tracked.policy.idleTimeoutMs;
  if (idleTimeoutMs <= 0) {
    return;
  }

  const expiresAt = new Date(Date.now() + idleTimeoutMs).toISOString();
  recordEvent(tracked, "idle-scheduled", `expires ${expiresAt}`);
  logTimeline(tracked, "idle-scheduled", expiresAt);

  tracked.idleTimer = setTimeout(() => {
    if (!registry.sessions.has(tracked.key)) {
      return;
    }
    if (tracked.state === "busy") {
      scheduleIdleTimeout(tracked);
      return;
    }
    killTmuxSession(tracked.sessionName);
    recordEvent(tracked, "idle-expired", `after ${idleTimeoutMs}ms idle`);
    logTimeline(tracked, "idle-expired");
    registry.sessions.delete(tracked.key);
  }, idleTimeoutMs);
}

function clearIdleTimer(tracked: TrackedTmuxSession): void {
  if (tracked.idleTimer) {
    clearTimeout(tracked.idleTimer);
    tracked.idleTimer = null;
  }
}

function scheduleDetachedIdleKill(tracked: TrackedTmuxSession): void {
  const idleTimeoutMs = tracked.policy.idleTimeoutMs;
  if (idleTimeoutMs <= 0) {
    return;
  }

  const expiresAt = new Date(Date.now() + idleTimeoutMs).toISOString();
  recordEvent(tracked, "idle-scheduled", `detached kill at ${expiresAt}`);
  logTimeline(tracked, "idle-scheduled", `detached kill at ${expiresAt}`);

  const seconds = Math.max(1, Math.ceil(idleTimeoutMs / 1000));
  const sessionName = tracked.sessionName.replace(/'/g, `'\\''`);
  const child = spawn(
    "bash",
    ["-c", `sleep ${seconds} && tmux kill-session -t '${sessionName}' 2>/dev/null`],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
}

function recordEvent(
  tracked: TrackedTmuxSession,
  type: TmuxTimelineEventType,
  detail?: string,
): void {
  tracked.timeline.push({
    at: new Date().toISOString(),
    type,
    contributorId: tracked.contributorId,
    sessionName: tracked.sessionName,
    detail,
  });
}

function logTimeline(tracked: TrackedTmuxSession, type: TmuxTimelineEventType, detail?: string): void {
  const suffix = detail ? ` (${detail})` : "";
  console.error(`[mw:tmux] ${tracked.contributorId} ${tracked.sessionName} ${type}${suffix}`);
}

async function persistTmuxTimeline(events: TmuxTimelineEvent[]): Promise<void> {
  if (events.length === 0) return;

  await mkdir(missionWriterDir(), { recursive: true });
  const path = tmuxTimelinePath();
  await writeFile(path, JSON.stringify({ updatedAt: new Date().toISOString(), events }, null, 2) + "\n", "utf8");
  console.error(`[mw:tmux] timeline saved to ${path}`);
}

async function loadPersistedTmuxState(): Promise<PersistedTmuxState> {
  try {
    const raw = await readFile(tmuxSessionsPath(), "utf8");
    const parsed = JSON.parse(raw) as PersistedTmuxState;
    if (!Array.isArray(parsed.sessions)) {
      return { updatedAt: new Date().toISOString(), sessions: [] };
    }
    return parsed;
  } catch {
    return { updatedAt: new Date().toISOString(), sessions: [] };
  }
}

async function writePersistedTmuxState(state: PersistedTmuxState): Promise<void> {
  await mkdir(missionWriterDir(), { recursive: true });
  await writeFile(tmuxSessionsPath(), JSON.stringify(state, null, 2) + "\n", "utf8");
}

async function persistTmuxState(): Promise<void> {
  const persisted = await loadPersistedTmuxState();
  const byName = new Map(persisted.sessions.map(session => [session.sessionName, session]));

  for (const tracked of registry.sessions.values()) {
    byName.set(tracked.sessionName, {
      contributorId: tracked.contributorId,
      sessionName: tracked.sessionName,
      cwd: tracked.cwd,
      model: tracked.model,
      state: tracked.state,
      createdAt: new Date(tracked.createdAt).toISOString(),
      lastActiveAt: new Date(tracked.lastActiveAt).toISOString(),
      timeline: tracked.timeline,
    });
  }

  await writePersistedTmuxState({
    updatedAt: new Date().toISOString(),
    sessions: [...byName.values()].sort((left, right) =>
      left.sessionName.localeCompare(right.sessionName),
    ),
  });
}

function toSessionSummary(tracked: TrackedTmuxSession): TmuxSessionSummary {
  return {
    contributorId: tracked.contributorId,
    sessionName: tracked.sessionName,
    cwd: tracked.cwd,
    model: tracked.model,
    state: tracked.state,
    alive: isTmuxSessionAlive(tracked.sessionName),
    createdAt: new Date(tracked.createdAt).toISOString(),
    lastActiveAt: new Date(tracked.lastActiveAt).toISOString(),
    attach: `tmux attach -t ${tracked.sessionName}`,
  };
}

export { isTmuxSessionAlive, killTmuxSession };

function normalizeTmuxSessionName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 64);
}
