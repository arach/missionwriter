/** Client-safe formatters (no node deps), copied from missionwriter/src/runs.ts. */

/** Last path segment, for showing a mission/workdir without its full path. */
export function basename(p: string): string {
  if (!p) return "";
  const parts = p.split("/").filter(Boolean);
  return parts.length ? (parts[parts.length - 1] ?? p) : p;
}

/** "just now" / "3m ago" / "2h ago" — computed from an ISO timestamp. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const sec = Math.floor((now - then) / 1000);
  if (sec < 45) return "just now";
  if (sec < 90) return "1m ago";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
}

/** "820ms" / "6.9s" / "1m 12s" / "1h 4m" from a millisecond duration. */
export function humanDuration(ms: number | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(sec < 10 ? 1 : 0)}s`;
  const total = Math.round(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/**
 * An article-style title from a mission filename:
 * "website-review.mission.md" → "Website Review", "ops-control-minimap" → "Ops Control Minimap".
 */
export function editorialTitle(missionPath: string): string {
  const base = basename(missionPath)
    .replace(/\.mission\.md$/i, "")
    .replace(/\.md$/i, "");
  const words = base.replace(/[-_.]+/g, " ").trim();
  if (!words) return "Untitled run";
  return words.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** "Jul 1, 2026, 16:04" — stable en-US, 24h. */
export function formatAbsolute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
