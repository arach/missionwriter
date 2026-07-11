import { cx } from "../lib/site";
import { CopyButton } from "./CopyButton";

type Line = { cmd: string; comment?: string };

/**
 * A clean terminal chip: each line rendered with a dim `$` prompt, an optional
 * trailing comment, and one copy control that yields the raw commands.
 */
export function CommandBlock({
  lines,
  className,
  copyable = true,
}: {
  lines: Line[];
  className?: string;
  copyable?: boolean;
}) {
  const copyValue = lines.map((l) => l.cmd).join("\n");

  return (
    <div
      className={cx(
        "group relative rounded-[4px] border bg-card/60 mw-hairline",
        "backdrop-blur-sm",
        className,
      )}
    >
      <div className="mw-code flex flex-col gap-1 px-4 py-3.5 pr-12">
        {lines.map((line) => (
          <div key={line.cmd} className="flex items-baseline gap-2 whitespace-nowrap">
            <span className="select-none text-primary/70">$</span>
            <span className="text-foreground/90">{line.cmd}</span>
            {line.comment ? (
              <span className="text-muted-foreground/55 italic">{line.comment}</span>
            ) : null}
          </div>
        ))}
      </div>
      {copyable ? (
        <div className="absolute right-2.5 top-2.5">
          <CopyButton value={copyValue} label="Copy commands" />
        </div>
      ) : null}
    </div>
  );
}
