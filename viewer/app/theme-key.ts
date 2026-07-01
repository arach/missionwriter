/** Shared constant — imported by both the server layout (theme script) and the
 *  client viewer (theme toggle). Kept in its own module so the client component
 *  never imports the server layout (which owns `metadata` + the theme script). */
export const THEME_STORAGE_KEY = "missionwriter.theme";
