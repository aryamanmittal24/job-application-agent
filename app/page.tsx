import type { Metadata } from "next";
import { JobDashboard } from "./components/JobDashboard";

export const metadata: Metadata = {
  title: "JobPilot — Resume-matched job search",
  description: "A private, local-first job discovery and one-click application workspace.",
};

export default function Home() {
  return <JobDashboard />;
}
