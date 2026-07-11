export const GITHUB_URL = "https://github.com/arach/missionwriter";
export const README_URL = "https://github.com/arach/missionwriter#readme";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
