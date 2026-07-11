import type { Metadata } from "next";
import { Newsreader } from "next/font/google";
import { getHudsonThemeScript } from "hudsonkit/theme-script";
import { THEME_STORAGE_KEY } from "./theme-key";
import "hudsonkit/styles/tokens.css";
import "./globals.css";

/* Editorial serif for the display type — self-hosted by next/font (offline-safe). */
const editorial = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "500", "600"],
  variable: "--font-editorial-src",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://arach.github.io/missionwriter/"),
  title: "Missionwriter — an agentic Markdown workspace",
  description:
    "Write, review, and revise Markdown with coding agents through explicit missions, live documents, anchored feedback, and immutable run history.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Missionwriter — an agentic Markdown workspace",
    description:
      "Explicit writing missions, live Markdown editing, anchored agent feedback, and traceable revisions.",
    url: "/",
    siteName: "Missionwriter",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={editorial.variable} suppressHydrationWarning>
      <head>
        {/* Applies data-hudson-theme / data-hudson-template pre-paint (no flash). */}
        <script
          dangerouslySetInnerHTML={{
            __html: getHudsonThemeScript({
              storageKey: THEME_STORAGE_KEY,
              defaultTheme: "dark",
              defaultTemplate: "hudson",
            }),
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
