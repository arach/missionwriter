"use client";

import {
  Bot,
  LoaderCircle,
  MessageSquarePlus,
  Quote,
  Send,
  Trash2,
} from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { CodeEditorSelection } from "hudsonkit/controls";
import type { RunView } from "@/src/runs-data";

export interface AgentContextNote {
  id: string;
  from: number;
  to: number;
  lineStart: number;
  lineEnd: number;
  quote: string;
  note: string;
  stale: boolean;
}

export interface MissionwriterAgentSession {
  key: string;
  run: RunView;
  outputName: string;
  selection: CodeEditorSelection | null;
  selectionLines: { lineStart: number; lineEnd: number } | null;
  noteDraft: string;
  setNoteDraft: Dispatch<SetStateAction<string>>;
  notes: AgentContextNote[];
  addContextNote: () => void;
  removeContextNote: (id: string) => void;
  prompt: string;
  setPrompt: Dispatch<SetStateAction<string>>;
  revise: () => Promise<void>;
  dirty: boolean;
  conflict: boolean;
  saving: boolean;
  revising: boolean;
  writable: boolean;
  exists: boolean;
  hasStaleNotes: boolean;
  askDisabled: boolean;
  error: string | null;
}

interface MissionwriterAgentContextValue {
  session: MissionwriterAgentSession | null;
  publish: Dispatch<SetStateAction<MissionwriterAgentSession | null>>;
}

const MissionwriterAgentContext = createContext<MissionwriterAgentContextValue | null>(null);

export function MissionwriterAgentProvider({ children }: { children: ReactNode }) {
  const [session, publish] = useState<MissionwriterAgentSession | null>(null);
  const value = useMemo(() => ({ session, publish }), [session]);
  return <MissionwriterAgentContext.Provider value={value}>{children}</MissionwriterAgentContext.Provider>;
}

function useMissionwriterAgent() {
  const context = useContext(MissionwriterAgentContext);
  if (!context) throw new Error("Missionwriter agent components must be rendered inside MissionwriterAgentProvider");
  return context;
}

export function usePublishMissionwriterAgentSession(session: MissionwriterAgentSession | null) {
  const { publish } = useMissionwriterAgent();
  const sessionKey = session?.key;

  useEffect(() => {
    publish(session);
  }, [publish, session]);

  useEffect(() => {
    return () => {
      publish(current => current?.key === sessionKey ? null : current);
    };
  }, [publish, sessionKey]);
}

export function MissionwriterAgentInspector() {
  const { session } = useMissionwriterAgent();

  if (!session) {
    return (
      <div className="flex min-h-full flex-col px-4 py-5">
        <div className="flex items-center gap-2 text-[12px] font-medium text-foreground">
          <Bot size={14} className="text-accent" /> Ask MW
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          The agent is available throughout Missionwriter. Select a run with a declared Markdown output to give it a live document context.
        </p>
      </div>
    );
  }

  const {
    run,
    outputName,
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
    conflict,
    revising,
    hasStaleNotes,
    askDisabled,
    error,
  } = session;

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-border/60 px-4 py-3">
        <div className="truncate text-[11px] font-medium text-foreground" title={outputName}>{outputName}</div>
        <div className="mt-1 font-mono text-[9px] text-muted-foreground">{run.writer}/{run.model || "default"}</div>
      </div>

      <div className="space-y-4 p-4">
        {error && (
          <div className="rounded-[3px] border border-destructive/25 bg-destructive/[0.06] px-3 py-2 text-[10.5px] leading-relaxed text-destructive">
            {error}
          </div>
        )}

        <section>
          <div className="flex items-center gap-1.5 text-[9.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            <MessageSquarePlus size={12} /> In-context note
          </div>
          {selection && selectionLines ? (
            <div className="mt-2 rounded-[3px] border border-accent/25 bg-accent/[0.05] p-2.5">
              <div className="font-mono text-[9px] text-accent">{formatLines(selectionLines)}</div>
              <blockquote className="mt-1.5 max-h-24 overflow-hidden whitespace-pre-wrap border-l-2 border-accent/35 pl-2 text-[10.5px] leading-relaxed text-foreground/75">
                {selection.text}
              </blockquote>
              <textarea
                value={noteDraft}
                onChange={event => setNoteDraft(event.target.value)}
                rows={2}
                placeholder="What should change here?"
                className="mt-2 w-full resize-y rounded-[3px] border border-border/70 bg-background/70 px-2.5 py-2 text-[11px] leading-relaxed text-foreground outline-none focus:border-ring"
              />
              <button
                type="button"
                onClick={addContextNote}
                disabled={!noteDraft.trim()}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-[3px] border border-accent/30 bg-accent/10 px-2 py-1.5 text-[10.5px] font-medium text-accent disabled:opacity-40"
              >
                <MessageSquarePlus size={11} /> Add note to selection
              </button>
            </div>
          ) : (
            <p className="mt-2 rounded-[3px] border border-dashed border-border/60 px-3 py-3 text-[10.5px] leading-relaxed text-muted-foreground">
              Select text in the live document to attach precise feedback.
            </p>
          )}
        </section>

        {notes.length > 0 && (
          <section>
            <div className="text-[9.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Notes · {notes.length}</div>
            <div className="mt-2 space-y-2">
              {notes.map(note => (
                <article key={note.id} className={`rounded-[3px] border p-2.5 ${note.stale ? "border-warning/35 bg-warning/[0.06]" : "border-border/70 bg-background/45"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`font-mono text-[9px] ${note.stale ? "text-warning" : "text-muted-foreground"}`}>
                      {note.stale ? "Selection changed" : formatLines(note)}
                    </span>
                    <button type="button" onClick={() => removeContextNote(note.id)} aria-label="Remove context note" className="text-muted-foreground hover:text-destructive">
                      <Trash2 size={11} />
                    </button>
                  </div>
                  <div className="mt-1.5 flex gap-1.5 text-[10px] leading-relaxed text-foreground/65">
                    <Quote size={10} className="mt-0.5 shrink-0" />
                    <span className="line-clamp-3 whitespace-pre-wrap">{note.quote}</span>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-foreground/85">{note.note}</p>
                </article>
              ))}
            </div>
          </section>
        )}

      </div>

      <form
        onSubmit={event => {
          event.preventDefault();
          if (!askDisabled) void revise();
        }}
        className="sticky bottom-0 mt-auto border-t border-border/60 bg-card/95 p-3 backdrop-blur-sm"
      >
        <div className="rounded-lg border border-border bg-muted/45 px-3 py-2 transition-colors focus-within:border-accent/45 focus-within:ring-1 focus-within:ring-accent/15">
          <textarea
            id="mw-agent-prompt"
            aria-label="Message MW"
            value={prompt}
            onChange={event => setPrompt(event.target.value)}
            onKeyDown={event => {
              event.stopPropagation();
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (!askDisabled) void revise();
              }
            }}
            disabled={revising}
            rows={1}
            placeholder="Message MW…"
            className="max-h-32 min-h-6 w-full resize-none overflow-y-auto bg-transparent text-[12px] leading-relaxed text-foreground outline-none [field-sizing:content] placeholder:text-muted-foreground/70"
          />
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <span className={`min-w-0 truncate font-mono text-[9px] ${dirty || conflict || hasStaleNotes ? "text-warning" : "text-muted-foreground"}`}>
              {dirty ? "Save before sending" : conflict ? "Resolve file conflict" : hasStaleNotes ? "Refresh stale context" : notes.length > 0 ? `${notes.length} context ${notes.length === 1 ? "note" : "notes"}` : "Enter to send · Shift+Enter for newline"}
            </span>
            <button
              type="submit"
              disabled={askDisabled}
              aria-label={revising ? "MW is revising" : "Send to MW"}
              title={revising ? "MW is revising" : "Send to MW"}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-accent/30 bg-accent/10 text-accent transition-colors hover:bg-accent/20 disabled:cursor-default disabled:opacity-30"
            >
              {revising ? <LoaderCircle size={13} className="animate-spin" /> : <Send size={13} />}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function formatLines(lines: { lineStart: number; lineEnd: number }): string {
  return lines.lineStart === lines.lineEnd ? `Line ${lines.lineStart}` : `Lines ${lines.lineStart}-${lines.lineEnd}`;
}
