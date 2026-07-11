"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, MessageSquarePlus, RefreshCw } from "lucide-react";
import { useAppShellSidePanels } from "hudsonkit/app-shell";
import { HudsonContextMenu, type ContextMenuEntry } from "hudsonkit/context-menu";
import {
  TextDocumentSurface,
  type CodeEditorSelection,
  type HudsonTextDocument,
} from "hudsonkit/controls";
import type { RunView } from "@/src/runs-data";
import {
  usePublishMissionwriterAgentSession,
  type AgentContextNote,
  type MissionwriterAgentSession,
} from "./MissionwriterAgent";

interface LiveDocumentPayload {
  document: HudsonTextDocument;
  output: { index: number; name: string; rel: string };
  revision: string | null;
  exists: boolean;
  writable: boolean;
}

interface ApiError {
  error?: string;
  code?: string;
  latest?: LiveDocumentPayload;
}

export function LiveDocumentEditor({
  run,
  outputIndex,
  onRevisionComplete,
}: {
  run: RunView;
  outputIndex: number;
  onRevisionComplete: (runId: string) => void;
}) {
  const { right } = useAppShellSidePanels();
  const [live, setLive] = useState<LiveDocumentPayload | null | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const [diskValue, setDiskValue] = useState("");
  const [prompt, setPrompt] = useState("");
  const [selection, setSelection] = useState<CodeEditorSelection | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [notes, setNotes] = useState<AgentContextNote[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<LiveDocumentPayload | null>(null);
  const [saving, setSaving] = useState(false);
  const [revising, setRevising] = useState(false);

  const endpoint = `/api/runs/${encodeURIComponent(run.id)}/outputs/${outputIndex}`;

  const applyLive = useCallback((next: LiveDocumentPayload) => {
    setLive(next);
    setDraft(next.document.value);
    setDiskValue(next.document.value);
    setSelection(null);
    setNoteDraft("");
    setNotes([]);
    setConflict(null);
    setError(null);
  }, []);

  const load = useCallback(async () => {
    const response = await fetch(`${endpoint}/live`, { cache: "no-store" });
    const body = (await response.json()) as LiveDocumentPayload & ApiError;
    if (!response.ok) throw new Error(body.error || `GET live document → ${response.status}`);
    applyLive(body);
  }, [applyLive, endpoint]);

  useEffect(() => {
    setLive(undefined);
    setError(null);
    void load().catch(cause => {
      setLive(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    });
  }, [load]);

  const dirty = draft !== diskValue;

  useEffect(() => {
    if (!live || dirty || saving || revising || conflict) return;
    const timer = setInterval(() => {
      void (async () => {
        const response = await fetch(`${endpoint}/live`, { cache: "no-store" });
        if (!response.ok) return;
        const next = (await response.json()) as LiveDocumentPayload;
        if (next.revision !== live.revision) applyLive(next);
      })();
    }, 4000);
    return () => clearInterval(timer);
  }, [applyLive, conflict, dirty, endpoint, live, revising, saving]);

  const document = useMemo<HudsonTextDocument | null>(() => live ? {
    ...live.document,
    value: draft,
    readOnly: !live.writable || revising,
  } : null, [draft, live, revising]);

  const updateDraft = useCallback((next: string) => {
    setDraft(next);
    setNotes(previous => previous.map(note => {
      const exact = next.slice(note.from, note.to) === note.quote;
      const lines = exact ? lineRange(next, note.from, note.to) : null;
      return {
        ...note,
        stale: !exact,
        ...(lines ?? {}),
      };
    }));
  }, []);

  const save = useCallback(async (value: string) => {
    if (!live) throw new Error("live document is not loaded");
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`${endpoint}/live`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value, revision: live.revision }),
      });
      const body = (await response.json()) as LiveDocumentPayload & ApiError;
      if (!response.ok) {
        if (response.status === 409 && body.latest) setConflict(body.latest);
        throw new Error(body.error || `PUT live document → ${response.status}`);
      }
      setLive(body);
      setDraft(body.document.value);
      setDiskValue(body.document.value);
      setConflict(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      throw cause;
    } finally {
      setSaving(false);
    }
  }, [endpoint, live]);

  const captureSelection = useCallback((next: CodeEditorSelection) => {
    if (next.from === next.to || !next.text.trim()) {
      setSelection(null);
      return;
    }
    setSelection(next);
  }, []);

  const openAgentForSelection = useCallback(() => {
    right.setCollapsed(false);
  }, [right]);

  const selectionMenuItems = useMemo<ContextMenuEntry[]>(() => selection ? [{
    id: "missionwriter:ask-selection",
    label: "Ask MW about selection",
    icon: <MessageSquarePlus size={13} />,
    action: openAgentForSelection,
  }] : [], [openAgentForSelection, selection]);

  const addContextNote = useCallback(() => {
    const feedback = noteDraft.trim();
    if (!selection || !feedback) return;
    const lines = lineRange(draft, selection.from, selection.to);
    setNotes(previous => [...previous, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      from: selection.from,
      to: selection.to,
      quote: selection.text,
      note: feedback,
      stale: draft.slice(selection.from, selection.to) !== selection.text,
      ...lines,
    }]);
    setNoteDraft("");
  }, [draft, noteDraft, selection]);

  const removeContextNote = useCallback((id: string) => {
    setNotes(previous => previous.filter(note => note.id !== id));
  }, []);

  const revise = useCallback(async () => {
    if (!live || dirty || conflict || notes.some(note => note.stale) || (!prompt.trim() && notes.length === 0)) return;
    setRevising(true);
    setError(null);
    try {
      const response = await fetch(`${endpoint}/revise`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          revision: live.revision,
          notes: notes.map(({ from, to, quote, note }) => ({ from, to, quote, note })),
        }),
      });
      const body = (await response.json()) as { run?: { id?: string } } & ApiError;
      if (!response.ok) {
        if (response.status === 409 && body.latest) setConflict(body.latest);
        throw new Error(body.error || `POST revision → ${response.status}`);
      }
      const runId = body.run?.id;
      if (!runId) throw new Error("revision completed without a run id");
      setPrompt("");
      setNotes([]);
      onRevisionComplete(runId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRevising(false);
    }
  }, [conflict, dirty, endpoint, live, notes, onRevisionComplete, prompt]);

  const hasStaleNotes = notes.some(note => note.stale);
  const askDisabled = revising || saving || dirty || !!conflict || hasStaleNotes
    || (!prompt.trim() && notes.length === 0) || !live?.exists || !live.writable;
  const selectionLines = useMemo(
    () => selection ? lineRange(draft, selection.from, selection.to) : null,
    [draft, selection],
  );

  const agentSession = useMemo<MissionwriterAgentSession | null>(() => live && document ? {
    key: `${run.id}:${outputIndex}`,
    run,
    outputName: live.output.name,
    selection,
    selectionLines,
    noteDraft,
    setNoteDraft,
    notes,
    addContextNote,
    removeContextNote,
    prompt,
    setPrompt,
    revise,
    dirty,
    conflict: !!conflict,
    saving,
    revising,
    writable: live.writable,
    exists: live.exists,
    hasStaleNotes,
    askDisabled,
    error,
  } : null, [
    addContextNote,
    askDisabled,
    conflict,
    dirty,
    document,
    error,
    hasStaleNotes,
    live,
    noteDraft,
    notes,
    outputIndex,
    prompt,
    removeContextNote,
    revise,
    revising,
    run,
    saving,
    selection,
    selectionLines,
  ]);
  usePublishMissionwriterAgentSession(agentSession);

  if (live === undefined) {
    return <div className="flex min-h-[360px] items-center justify-center font-mono text-[11px] text-muted-foreground">Loading live document…</div>;
  }

  if (!live || !document) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center rounded-[3px] border border-dashed border-border/60 p-8 text-center">
        <AlertTriangle size={22} className="text-destructive/70" />
        <p className="mt-2 text-[13px] text-muted-foreground">{error || "The live document is unavailable."}</p>
        <button type="button" onClick={() => void load()} className="mt-4 flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-[11px] text-foreground">
          <RefreshCw size={12} /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[600px] flex-col gap-3">
      {conflict && (
        <div className="flex items-center justify-between gap-4 rounded-[3px] border border-warning/30 bg-warning/[0.07] px-3 py-2 text-[11px] text-warning">
          <span>The file changed on disk. Your draft was not overwritten.</span>
          <button type="button" onClick={() => applyLive(conflict)} className="shrink-0 rounded border border-warning/30 px-2 py-1 font-medium hover:bg-warning/10">
            Discard draft and reload
          </button>
        </div>
      )}

      {error && !conflict && (
        <div className="rounded-[3px] border border-destructive/25 bg-destructive/[0.06] px-3 py-2 text-[11px] text-destructive">{error}</div>
      )}

      <HudsonContextMenu items={selectionMenuItems} nativeMenuModifier="alt">
        <div className="relative min-h-0 flex-1">
          <TextDocumentSurface
            key={document.id}
            document={document}
            mode="edit"
            onChange={updateDraft}
            onSave={save}
            onSelectionChange={captureSelection}
            className="min-h-[520px] rounded-[3px]"
          />
          {selection && (
            <button
              type="button"
              onClick={openAgentForSelection}
              className="absolute bottom-4 right-4 z-10 flex items-center gap-1.5 rounded-[3px] border border-accent/30 bg-card/95 px-2.5 py-1.5 text-[10.5px] font-medium text-foreground shadow-[var(--hud-shadow-panel)] backdrop-blur-sm transition-colors hover:border-accent/55 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MessageSquarePlus size={12} className="text-accent" /> Ask MW about selection
            </button>
          )}
        </div>
      </HudsonContextMenu>
    </div>
  );
}

function lineRange(value: string, from: number, to: number): { lineStart: number; lineEnd: number } {
  return {
    lineStart: lineNumberAt(value, from),
    lineEnd: lineNumberAt(value, Math.max(from, to - 1)),
  };
}

function lineNumberAt(value: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index++) {
    if (value.charCodeAt(index) === 10) line++;
  }
  return line;
}
