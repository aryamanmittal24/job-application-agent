import assert from "node:assert/strict";
import test from "node:test";
import { scoreJob, stripHtml } from "./matcher.mjs";

test("strips Greenhouse HTML", () => {
  assert.equal(stripHtml("<p>Build &amp; ship</p>"), "Build & ship");
});

test("scores an aligned job above a mismatched senior role", () => {
  const profile = {
    skills: ["TypeScript", "React"],
    yearsExperience: 2,
    preferredTitles: ["software engineer"],
    preferredLocations: ["remote"],
    resumeText: "Built React products with TypeScript",
  };
  const aligned = scoreJob({ title: "Software Engineer", location: "Remote", description: "2 years experience with React and TypeScript" }, profile);
  const mismatch = scoreJob({ title: "Principal Architect", location: "Tokyo", description: "10 years experience with Java" }, profile);
  assert.ok(aligned.score > mismatch.score);
  assert.equal(aligned.verdict, "strong");
});
