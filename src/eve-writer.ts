import { spawn } from "node:child_process";

import type { MissionWriterContext, Writer } from "./writer.js";

const PI_BIN = process.env.PI_BIN ?? "pi";
const DEFAULT_MODEL_SENTINEL = "default";

/** pi's built-in tools minus write/edit/bash: `review` must not mutate sources. */
const READ_ONLY_TOOLS = "read,grep,find,ls";

/**
 * Eve writer — drives the `pi` coding agent (@earendil-works/pi-coding-agent) as
 * a host subprocess scoped to spec.workdir. pi IS the harness: it brings the
 * agent loop, built-in file tools, session/compaction, and provider/model config
 * (from ~/.pi/agent/settings.json — minimax/MiniMax-M2.7 by default), so
 * missionwriter carries no agent-loop dependency of its own.
 *
 * We run `pi --print --no-session --mode json` and translate its JSON event
 * lines the way the Cursor writer does: assistant text -> stdout, tools -> stderr.
 */
export class EveWriter implements Writer {
  async run({ spec, model, systemPrompt, briefWithReports }: MissionWriterContext): Promise<void> {
    const args = ["--print", "--no-session", "--mode", "json"];

    // Layer the mission framing on top of pi's built-in coding-assistant prompt.
    if (systemPrompt.trim()) args.push("--append-system-prompt", systemPrompt);

    // Override the model only when the mission asked for one; otherwise inherit
    // pi's configured default. pi accepts a "provider/id" pattern here too.
    const overrideModel = model && model !== DEFAULT_MODEL_SENTINEL ? model : null;
    if (overrideModel) args.push("--model", overrideModel);

    // Gate tools by shape so `review` can't edit source files.
    if (spec.shape === "review") args.push("--tools", READ_ONLY_TOOLS);

    // The brief (+ contributor reports) is the user turn. spawn passes argv
    // directly (no shell), so newlines/quotes in the brief are safe.
    args.push(briefWithReports);

    console.error(
      `[mw] starting ${spec.shape} mission in ${spec.workdir} ` +
        `(writer=eve pi=${PI_BIN} model=${overrideModel ?? "<pi default>"})`,
    );

    await runPi(args, spec.workdir);
  }
}

function runPi(args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(PI_BIN, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    const printer = new AssistantTextPrinter();
    let buffer = "";
    let stderrTail = "";

    const consume = (line: string) => {
      if (line.trim()) handlePiEvent(line, printer);
    };

    child.stdout.on("data", chunk => {
      buffer += chunk as string;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        consume(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    });

    child.stderr.on("data", chunk => {
      const text = chunk as string;
      stderrTail = (stderrTail + text).slice(-4000);
      process.stderr.write(text);
    });

    child.on("error", error => {
      const notFound = (error as NodeJS.ErrnoException).code === "ENOENT";
      reject(
        new Error(
          notFound
            ? `pi binary '${PI_BIN}' not found on PATH. Install it (npm i -g @earendil-works/pi-coding-agent) or set PI_BIN.`
            : `failed to start pi: ${error.message}`,
        ),
      );
    });

    child.on("close", code => {
      if (buffer.trim()) consume(buffer);
      if (code === 0) {
        process.stderr.write(`\n[mw] done. status=finished\n`);
        resolve();
      } else {
        reject(new Error(`pi exited with code ${code ?? "unknown"}: ${stderrTail.trim().slice(-500)}`));
      }
    });
  });
}

/**
 * Streams assistant text to stdout, tolerating pi's JSON schema drift across
 * versions: it prints token deltas when it recognizes them, and otherwise falls
 * back to the complete text on `message_end` so nothing is lost either way.
 */
class AssistantTextPrinter {
  private streamedCurrent = false;

  startMessage(): void {
    this.streamedCurrent = false;
  }

  writeDelta(text: string): void {
    if (!text) return;
    this.streamedCurrent = true;
    process.stdout.write(text);
  }

  flushMessage(text: string): void {
    if (this.streamedCurrent || !text) return;
    process.stdout.write(text);
  }
}

function handlePiEvent(line: string, printer: AssistantTextPrinter): void {
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(line) as Record<string, unknown>;
  } catch {
    // `--mode json` should only emit JSON lines; anything else is diagnostics.
    process.stderr.write(line + "\n");
    return;
  }

  switch (event.type) {
    case "message_start":
      printer.startMessage();
      return;
    case "message_update": {
      const delta = assistantTextDelta(event.assistantMessageEvent);
      if (delta) printer.writeDelta(delta);
      return;
    }
    case "message_end": {
      const message = event.message as { role?: string; content?: unknown } | undefined;
      if (message?.role === "assistant") printer.flushMessage(assistantText(message));
      return;
    }
    case "tool_execution_start": {
      process.stderr.write(`\n[tool] ${str(event.toolName) ?? str(event.name) ?? "tool"}\n`);
      return;
    }
    case "tool_execution_end": {
      if (event.isError) process.stderr.write(`[tool:error] ${str(event.toolName) ?? str(event.name) ?? "tool"}\n`);
      return;
    }
    case "compaction_start":
      process.stderr.write(`\n[mw:pi] compacting context…\n`);
      return;
    case "auto_retry_start":
      process.stderr.write(`\n[mw:pi] retrying after error…\n`);
      return;
    case "error":
      process.stderr.write(`\n[mw:pi:error] ${str(event.errorMessage) ?? str(event.message) ?? ""}\n`);
      return;
    default:
      return;
  }
}

/** Streaming assistant text from a message_update's inner event; skips thinking. */
function assistantTextDelta(inner: unknown): string {
  if (!inner || typeof inner !== "object") return "";
  const e = inner as { type?: unknown; delta?: unknown; text?: unknown; partial?: unknown };
  const type = typeof e.type === "string" ? e.type : "";
  if (!type.includes("text") || type.includes("thinking")) return "";
  return str(e.delta) ?? str(e.text) ?? str(e.partial) ?? "";
}

/** Concatenate the text content blocks of a completed assistant message. */
function assistantText(message: { content?: unknown }): string {
  if (!Array.isArray(message.content)) return "";
  let out = "";
  for (const block of message.content) {
    if (block && typeof block === "object" && (block as { type?: string }).type === "text") {
      out += (block as { text?: string }).text ?? "";
    }
  }
  return out;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
