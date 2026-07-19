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

test("penalizes seniority that is well above the profile", () => {
  const profile = { skills: ["Java"], yearsExperience: 1.9, preferredTitles: ["software engineer"], resumeText: "Java engineer" };
  const junior = scoreJob({ title: "Software Engineer", location: "Remote", description: "Build Java services" }, profile);
  const staff = scoreJob({ title: "Staff Software Engineer", location: "Remote", description: "Build Java services" }, profile);
  assert.ok(junior.score - staff.score >= 20);
  assert.match(staff.reasons.join(" "), /seniority/i);
});

test("does not recommend internships to an experienced profile unless targeted", () => {
  const profile = { skills: ["Java"], yearsExperience: 1.9, preferredTitles: ["software engineer"], resumeText: "Java engineer" };
  const role = scoreJob({ title: "Software Engineer Intern", location: "Remote", description: "Build Java services" }, profile);
  assert.ok(role.score < 55);
});

test("excludes managers and non-engineering roles even when skills overlap", () => {
  const profile = { skills: ["Java", "Kafka", "Python"], yearsExperience: 1.9, preferredTitles: ["software engineer"], preferredLocations: ["bengaluru"], resumeText: "Java Kafka Python engineer" };
  const role = scoreJob({ title: "Technical Program Manager, Knowledge Systems", location: "Remote - USA", description: "Java Kafka Python systems" }, profile);
  assert.equal(role.verdict, "skip");
  assert.equal(role.score, 0);
});
