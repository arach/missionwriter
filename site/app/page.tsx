import { ClosingCTA } from "./components/ClosingCTA";
import { Features } from "./components/Features";
import { Footer } from "./components/Footer";
import { Hero } from "./components/Hero";
import { HowItWorks } from "./components/HowItWorks";
import { LiveWorkspaceShowcase } from "./components/LiveWorkspaceShowcase";
import { MissionShowcase } from "./components/MissionShowcase";
import { TopBar } from "./components/TopBar";
import { WhatItIs } from "./components/WhatItIs";

export default function Page() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <TopBar />
      <Hero />
      <MissionShowcase />
      <WhatItIs />
      <LiveWorkspaceShowcase />
      <Features />
      <HowItWorks />
      <ClosingCTA />
      <Footer />
    </main>
  );
}
