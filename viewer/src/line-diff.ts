/**
 * A tiny, dependency-free line diff. LCS-based, producing a unified sequence of
 * rows the viewer renders with restrained green/red hairlines. Client-safe (no
 * node deps) so it runs in the browser. For editorial documents (KBs) the O(n·m)
 * table is trivially cheap; a guard falls back to a plain replace for pathological
 * inputs so we never lock the main thread.
 */

export type DiffRowType = "same" | "add" | "del";

export interface DiffRow {
  type: DiffRowType;
  /** line number in the "before" text (1-based), null for additions */
  beforeNo: number | null;
  /** line number in the "after" text (1-based), null for deletions */
  afterNo: number | null;
  text: string;
}

export interface DiffStats {
  added: number;
  removed: number;
  unchanged: number;
}

export interface LineDiff {
  rows: DiffRow[];
  stats: DiffStats;
  /** true when the two inputs are byte-identical (nothing changed) */
  identical: boolean;
}

function splitLines(s: string): string[] {
  // Normalize trailing newline so a final "\n" doesn't manufacture a phantom row.
  const normalized = s.replace(/\r\n/g, "\n").replace(/\n$/, "");
  return normalized.length === 0 ? [] : normalized.split("\n");
}

const MAX_CELLS = 4_000_000; // ~2000×2000 lines — beyond this, fall back.

export function diffLines(before: string, after: string): LineDiff {
  const a = splitLines(before);
  const b = splitLines(after);

  if (before === after) {
    return {
      rows: a.map((text, i) => ({ type: "same", beforeNo: i + 1, afterNo: i + 1, text })),
      stats: { added: 0, removed: 0, unchanged: a.length },
      identical: true,
    };
  }

  const rows: DiffRow[] = [];
  const stats: DiffStats = { added: 0, removed: 0, unchanged: 0 };

  if (a.length * b.length > MAX_CELLS) {
    // Pathological size — show the whole "before" removed then "after" added.
    a.forEach((text, i) => rows.push({ type: "del", beforeNo: i + 1, afterNo: null, text }));
    b.forEach((text, i) => rows.push({ type: "add", beforeNo: null, afterNo: i + 1, text }));
    stats.removed = a.length;
    stats.added = b.length;
    return { rows, stats, identical: false };
  }

  // LCS length table.
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  // Backtrack into an ordered unified sequence.
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ type: "same", beforeNo: i + 1, afterNo: j + 1, text: a[i]! });
      stats.unchanged++;
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      rows.push({ type: "del", beforeNo: i + 1, afterNo: null, text: a[i]! });
      stats.removed++;
      i++;
    } else {
      rows.push({ type: "add", beforeNo: null, afterNo: j + 1, text: b[j]! });
      stats.added++;
      j++;
    }
  }
  while (i < n) {
    rows.push({ type: "del", beforeNo: i + 1, afterNo: null, text: a[i]! });
    stats.removed++;
    i++;
  }
  while (j < m) {
    rows.push({ type: "add", beforeNo: null, afterNo: j + 1, text: b[j]! });
    stats.added++;
    j++;
  }

  return { rows, stats, identical: false };
}
