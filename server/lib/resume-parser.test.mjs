import test from "node:test";
import assert from "node:assert/strict";
import { sectionResumeText } from "./resume-parser.mjs";

test("parses title-case PDF headings and recovers a trailing contact header", () => {
  const sections = sectionResumeText(`Education\nSchool\n\nTechnical Skills\nJava, SQL\n\nExperience\nSoftware Engineer\n\nProjects\nProject A\n\nAdditional\nAryaman Mittal\naryaman@example.com | LinkedIn`);
  assert.equal(sections.education, "School");
  assert.equal(sections.skills, "Java, SQL");
  assert.equal(sections.experience, "Software Engineer");
  assert.equal(sections.projects, "Project A");
  assert.match(sections.headline, /aryaman@example\.com/);
  assert.equal(sections.additional, "");
});
