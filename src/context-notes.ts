export interface RevisionContextNote {
  from: number;
  to: number;
  lineStart: number;
  lineEnd: number;
  quote: string;
  note: string;
}

export class RevisionContextError extends Error {
  constructor(
    public readonly code: "invalid_context_notes" | "context_mismatch",
    message: string,
    public readonly status: 400 | 409,
  ) {
    super(message);
    this.name = "RevisionContextError";
  }
}

export function parseRevisionContextNotes(value: unknown, document: string): RevisionContextNote[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw invalid("notes must be an array");
  if (value.length > 24) throw invalid("notes cannot contain more than 24 items");

  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw invalid(`notes[${index}] must be an object`);
    }
    const raw = item as Record<string, unknown>;
    const from = raw.from;
    const to = raw.to;
    const quote = raw.quote;
    const note = typeof raw.note === "string" ? raw.note.trim() : "";
    if (!Number.isInteger(from) || !Number.isInteger(to) || (from as number) < 0 || (to as number) <= (from as number)) {
      throw invalid(`notes[${index}] must have a non-empty integer range`);
    }
    if ((to as number) > document.length) throw invalid(`notes[${index}] range exceeds the document`);
    if (typeof quote !== "string" || quote.length === 0 || quote.length > 8_000) {
      throw invalid(`notes[${index}].quote must be between 1 and 8,000 characters`);
    }
    if (!note || note.length > 4_000) {
      throw invalid(`notes[${index}].note must be between 1 and 4,000 characters`);
    }
    if (document.slice(from as number, to as number) !== quote) {
      throw new RevisionContextError(
        "context_mismatch",
        `notes[${index}] no longer matches the current document`,
        409,
      );
    }

    return {
      from: from as number,
      to: to as number,
      lineStart: lineNumberAt(document, from as number),
      lineEnd: lineNumberAt(document, (to as number) - 1),
      quote,
      note,
    };
  });
}

export function formatRevisionBrief(prompt: string, notes: RevisionContextNote[]): string {
  const instruction = prompt.trim() || "Apply the in-context notes below.";
  if (notes.length === 0) return instruction;

  const formatted = notes.map((note, index) => [
    `[${index + 1}] Lines ${note.lineStart}${note.lineEnd === note.lineStart ? "" : `-${note.lineEnd}`} (offsets ${note.from}-${note.to})`,
    `Exact text: ${JSON.stringify(note.quote)}`,
    `Feedback: ${note.note}`,
  ].join("\n"));

  return [
    instruction,
    "",
    "=== IN-CONTEXT NOTES ===",
    "Apply each note to its exact quoted passage. Use the offsets and line ranges only to disambiguate the quote.",
    "",
    formatted.join("\n\n"),
  ].join("\n");
}

function lineNumberAt(document: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index++) {
    if (document.charCodeAt(index) === 10) line++;
  }
  return line;
}

function invalid(message: string): RevisionContextError {
  return new RevisionContextError("invalid_context_notes", message, 400);
}
