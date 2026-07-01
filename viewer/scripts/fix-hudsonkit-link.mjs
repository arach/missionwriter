// bun's `file:` install materializes node_modules/hudsonkit as a tree of
// per-file symlinks. Turbopack can't parse the symlinked package.json
// ("a redirect can't be parsed as json"), so it fails to resolve
// `hudsonkit/chrome`. Replacing it with a single directory symlink (the same
// shape a workspace/pnpm link produces) resolves cleanly and preserves React
// dedup via the app's own node_modules. Idempotent; safe to run every install.
import { existsSync, lstatSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(projectDir, "..", "..", "hudson", "packages", "web", "hudsonkit");
const link = join(projectDir, "node_modules", "hudsonkit");

if (!existsSync(target)) {
  console.warn(`[fix-hudsonkit-link] target not found: ${target} — skipping`);
  process.exit(0);
}

try {
  const stat = existsSync(link) ? lstatSync(link) : null;
  const alreadyGood = stat?.isSymbolicLink() && resolve(dirname(link), readlinkSync(link)) === target;
  if (alreadyGood) process.exit(0);

  if (stat) rmSync(link, { recursive: true, force: true });
  symlinkSync(target, link, "dir");
  console.log(`[fix-hudsonkit-link] linked node_modules/hudsonkit -> ${target}`);
} catch (err) {
  console.warn(`[fix-hudsonkit-link] ${err instanceof Error ? err.message : err}`);
}
