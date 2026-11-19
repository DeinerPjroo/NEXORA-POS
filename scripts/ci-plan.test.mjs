import { test } from "node:test";
import assert from "node:assert/strict";
import { makePlan, normalizeManifest } from "./ci-plan.mjs";

test("docs and version-only metadata do not trigger full suites", () => {
  const plan = makePlan([
    "docs/HANDOFF.md",
    "frontend/package.json",
    "frontend/package-lock.json",
  ]);
  assert.equal(plan.sql_mode, "off");
  assert.equal(plan.browser_mode, "off");
  assert.equal(plan.frontend_check, false);
  assert.deepEqual(
    normalizeManifest(
      {
        version: "2",
        packages: { "": { version: "2" }, scheduler: { version: "0.28" } },
      },
      true,
    ),
    { packages: { "": {}, scheduler: { version: "0.28" } } },
  );
});
test("dashboard selects its related tests and only one database engine automatically", () => {
  const plan = makePlan([
    "backend/app/Domains/Reporting/CommercialDashboard.php",
    "frontend/src/features/dashboard/CommercialPanel.tsx",
  ]);
  assert.equal(plan.sql_mode, "targeted");
  assert.match(plan.backend_filter, /CommercialDashboardTest/);
  assert.deepEqual(plan.browser_specs, ["commercial-dashboard.spec.ts"]);
  assert.equal(plan.sqlite_full, false);
});
test("full suites require explicit delivery scope and dependencies justify transverse checks", () => {
  const full = makePlan([], { manual: true, full: true });
  assert.equal(full.sql_mode, "full");
  assert.equal(full.sqlite_full, true);
  assert.equal(full.browser_mode, "full");
  assert.equal(
    makePlan(["frontend/package-lock.json"], { dependencyChange: true })
      .browser_mode,
    "full",
  );
});
test("rejects shell arguments, traversal and unknown scopes instead of silently claiming coverage", () => {
  assert.throws(() =>
    makePlan([], { manual: true, filter: "Test; echo secret" }),
  );
  assert.throws(() =>
    makePlan([], { manual: true, specs: "../other.spec.ts" }),
  );
  assert.throws(() => makePlan(["backend/app/Domains/Unknown/Unmapped.php"]));
});
test("large related module sets split validated filters instead of broadening to a full suite", () => {
  const plan = makePlan(["backend/app/Domains/Sales/RecordPayments.php"]);
  assert.equal(plan.sql_mode, "targeted");
  assert.ok(plan.backend_filters.length > 0);
  assert.ok(plan.backend_filters.every((filter) => filter.length <= 200));
  assert.equal(plan.backend_filters.join("|"), plan.backend_filter);
});
