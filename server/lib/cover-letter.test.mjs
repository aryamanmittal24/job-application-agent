import test from "node:test";
import assert from "node:assert/strict";
import { buildCoverLetter } from "./cover-letter.mjs";

test("builds a role-specific cover letter from verified achievements", () => {
  const letter = buildCoverLetter(
    { company: "ExampleCo", title: "Backend Engineer" },
    { firstName: "Aryaman", lastName: "Mittal", currentTitle: "Software Development Engineer", currentCompany: "Wayfair", yearsExperience: 2, achievements: "Reduced API latency by 35%.\nBuilt a reliable Java service." },
    { matchedSkills: ["java", "rest"] },
  );
  assert.match(letter, /Backend Engineer/);
  assert.match(letter, /ExampleCo/);
  assert.match(letter, /Reduced API latency by 35%/);
  assert.match(letter, /java, rest/);
});
