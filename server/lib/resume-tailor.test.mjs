import test from "node:test";
import assert from "node:assert/strict";
import { tailorResume } from "./resume-tailor.mjs";

test("suggests job keywords that are not already in the résumé", () => {
  const result = tailorResume({ company: "Example", title: "Backend Engineer", description: "Build Java microservices on AWS with distributed systems experience." }, "Java developer with microservices experience.");
  assert.deepEqual(result.matched, ["Java", "Microservices"]);
  assert.ok(result.suggested.includes("AWS"));
  assert.ok(result.suggested.includes("Distributed systems"));
  assert.match(result.draft, /Only weave in a term below where it truthfully reflects your work/);
});
