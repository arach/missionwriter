import { describe, expect, it } from "bun:test";

import {
  RevisionContextError,
  formatRevisionBrief,
  parseRevisionContextNotes,
} from "./context-notes";

const document = "# Opening\n\nFirst paragraph.\nSecond line.\n";

describe("revision context notes", () => {
  it("verifies exact anchors and computes line ranges", () => {
    const from = document.indexOf("First");
    const quote = "First paragraph.\nSecond line.";
    const notes = parseRevisionContextNotes([{ from, to: from + quote.length, quote, note: "Make this concrete." }], document);

    expect(notes).toEqual([{
      from,
      to: from + quote.length,
      lineStart: 3,
      lineEnd: 4,
      quote,
      note: "Make this concrete.",
    }]);
  });

  it("rejects an anchor when the quote no longer matches", () => {
    expect(() => parseRevisionContextNotes([{
      from: 0,
      to: 9,
      quote: "Different",
      note: "Fix it.",
    }], document)).toThrow(RevisionContextError);
    try {
      parseRevisionContextNotes([{ from: 0, to: 9, quote: "Different", note: "Fix it." }], document);
    } catch (error) {
      expect((error as RevisionContextError).code).toBe("context_mismatch");
      expect((error as RevisionContextError).status).toBe(409);
    }
  });

  it("formats notes as exact, agent-readable context", () => {
    const notes = parseRevisionContextNotes([{
      from: 0,
      to: 9,
      quote: "# Opening",
      note: "Use a more specific title.",
    }], document);
    const brief = formatRevisionBrief("Tighten the document.", notes);

    expect(brief).toContain("=== IN-CONTEXT NOTES ===");
    expect(brief).toContain("Lines 1 (offsets 0-9)");
    expect(brief).toContain('Exact text: "# Opening"');
    expect(brief).toContain("Feedback: Use a more specific title.");
  });

  it("allows notes to be the whole instruction", () => {
    const notes = parseRevisionContextNotes([{
      from: 0,
      to: 9,
      quote: "# Opening",
      note: "Rename this.",
    }], document);
    expect(formatRevisionBrief("", notes)).toStartWith("Apply the in-context notes below.");
  });
});
