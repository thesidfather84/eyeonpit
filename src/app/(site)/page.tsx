import type { Metadata } from "next";
import { Hero } from "@/components/site/home/Hero";
import { WorkflowSteps } from "@/components/site/home/WorkflowSteps";
import { EngineInputs } from "@/components/site/home/EngineInputs";
import { HardwareFlexible } from "@/components/site/home/HardwareFlexible";
import { FeatureGrid } from "@/components/site/home/FeatureGrid";
import { EngineSection } from "@/components/site/home/EngineSection";
import { EvidenceSection } from "@/components/site/home/EvidenceSection";
import { VisionSection } from "@/components/site/home/VisionSection";
import { TrainingSection } from "@/components/site/home/TrainingSection";
import { EnterpriseSection } from "@/components/site/home/EnterpriseSection";
import { DocsSection } from "@/components/site/home/DocsSection";

export const metadata: Metadata = {
  title: "EyeOnPit — Casino Game Protection, Rebuilt Around the Investigator",
  description:
    "EyeOnPit is a casino surveillance and game-protection investigation platform. Natural voice narration, a deterministic proprietary engine, and evidence-first blackjack investigation reporting.",
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <WorkflowSteps />
      <EngineInputs />
      <HardwareFlexible />
      <FeatureGrid />
      <EngineSection />
      <EvidenceSection />
      <VisionSection />
      <TrainingSection />
      <EnterpriseSection />
      <DocsSection />
    </>
  );
}
