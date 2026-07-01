import type { Metadata } from "next";
import { Newsreader } from "next/font/google";
import { getHudsonThemeScript } from "hudsonkit/theme-script";
import { THEME_STORAGE_KEY } from "./theme-key";
import "./globals.css";

/* Editorial serif for the "writing" surfaces — self-hosted by next/font (offline-safe). */
const editorial = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-editorial-src",
  display: "swap",
});

export const metadata: Metadata = {
  title: "missionwriter · runs",
  description: "Local run viewer for missionwriter — every `mw run` recorded under .runs/.",
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
