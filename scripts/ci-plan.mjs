import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const backendTests = ["Feature", "Unit"].flatMap((dir) =>
  readdirSync(`backend/tests/${dir}`)
    .filter((file) => file.endsWith("Test.php"))
    .map((file) => file.slice(0, -4)),
);
const browserTests = readdirSync("frontend/e2e").filter((file) =>
  file.endsWith(".spec.ts"),
);
const security =
  /Foundation|ScreenSecurity|EmailVerification|MultiFactor|MfaConcurrency|DeniedAccessAudit|Totp/;

export function normalizeManifest(value, lock = false) {
  const copy = structuredClone(value);
  delete copy.version;
  if (lock && copy.packages?.[""]) delete copy.packages[""].version;
  return copy;
}

export function makePlan(
  files,
  {
    manual = false,
    full = false,
    filter = "",
    specs = "",
    dependencyChange = false,
  } = {},
) {
  if (filter && !/^[A-Za-z0-9_:|.]{1,200}$/.test(filter))
    throw new Error("Filtro backend inválido.");
  const requested = specs.trim() ? specs.trim().split(/[\s,]+/) : [];
  for (const spec of requested)
    if (
      !/^[a-z0-9][a-z0-9-]*\.spec\.ts$/.test(spec) ||
      !browserTests.includes(spec)
    )
      throw new Error("Archivo Playwright no permitido.");
  const infrastructure = files.some(
    (file) => file.startsWith(".github/") || /^scripts\/ci-/.test(file),
  );
  const phpFiles = files.filter(
    (file) => /^(backend|scripts)\/.+\.php$/.test(file) && existsSync(file),
  );
  const frontendFiles = files.filter(
    (file) =>
      /^frontend\/(src|e2e)\/.+\.(tsx?|css)$/.test(file) && existsSync(file),
  );
  const backend = new Set(
    files
      .filter((file) =>
        /^backend\/tests\/(Feature|Unit)\/[A-Za-z0-9]+Test\.php$/.test(file),
      )
      .map((file) => basename(file, ".php")),
  );
  const browser = new Set(
    files
      .filter((file) => /^frontend\/e2e\/[a-z0-9-]+\.spec\.ts$/.test(file))
      .map((file) => basename(file)),
  );
  const productionPhp = files.filter((file) =>
    /^backend\/(app|bootstrap|routes|config|database)\//.test(file),
  );
  const productionFrontend = files.filter((file) =>
    /^frontend\/src\//.test(file),
  );
  const addBackend = (pattern) =>
    backendTests
      .filter((name) => pattern.test(name))
      .forEach((name) => backend.add(name));
  const addBrowser = (pattern) =>
    browserTests
      .filter((name) => pattern.test(name))
      .forEach((name) => browser.add(name));
  for (const file of productionPhp) {
    const flat = file.replace(/[^a-z]/gi, "").toLowerCase();
    backendTests
      .filter((name) => flat.includes(name.replace(/Test$/, "").toLowerCase()))
      .forEach((name) => backend.add(name));
    if (
      /Identity|Tenancy|Middleware|Providers|Models\/User|AuthController|Pin|Screen|Mfa|MultiFactor|EmailVerification|Login|RegisterCompany|Password|bootstrap\/|routes\//.test(
        file,
      )
    )
      addBackend(security);
    if (
      /Identity|Tenancy|Middleware|Models\/User|AuthController|bootstrap\//.test(
        file,
      )
    )
      addBrowser(
        /foundation|screen-security|email-verification|multi-factor|denied-access-audit|pos-context/,
      );
    if (/Branch|Role|Studio|Workspace/.test(file)) addBackend(/Foundation/);
    if (
      /Domains\/(Sales|Cash)|Sale|Payment|Refund|Cash|Order|Split/.test(file)
    ) {
      addBackend(
        /Sale|Cash|Payment|Refund|Installment|Split|Tax|Adjustment|Order/,
      );
      addBrowser(
        /cash|order|payment|refund|sale|split|tip|tax|installment|pos|checkout/,
      );
    }
    if (
      /Domains\/Catalog|Product|Category|Variant|Modifier|Combo|Promotion|Availability|ContextPrice|TaxProfile/.test(
        file,
      )
    ) {
      addBackend(
        /Catalog|Category|Modifier|Combo|Promotion|Availability|ContextPrice|ProductTax/,
      );
      addBrowser(
        /catalog|combo|modifier|promotion|product|subcategor|context-price|availability/,
      );
    }
    if (/Dining/.test(file)) {
      addBackend(/Dining/);
      addBrowser(/dining/);
    }
    if (/Domains\/Reporting|CommercialDashboard/.test(file)) {
      addBackend(/CommercialDashboard|PaymentHistory|PaymentReview/);
      addBrowser(/commercial-dashboard/);
    }
  }
  if (files.includes("scripts/test-mfa-worker.php"))
    addBackend(/MfaConcurrency/);
  for (const file of productionFrontend) {
    if (
      /features\/auth|components\/AppShell|\/App.tsx|lib\/(api|types)/.test(
        file,
      )
    )
      addBrowser(
        /foundation|screen-security|email-verification|multi-factor|denied-access-audit|pos-context/,
      );
    if (/features\/workspace/.test(file)) addBrowser(/foundation|pos-context/);
    if (/features\/dashboard/.test(file)) addBrowser(/commercial-dashboard/);
    if (/features\/dining/.test(file)) addBrowser(/dining/);
    if (/features\/pos/.test(file)) addBrowser(/^pos/);
    if (/features\/(sales|cash|orders|operations)|lib\/money/.test(file))
      addBrowser(
        /cash|order|payment|refund|sale|split|tip|tax|installment|pos|checkout/,
      );
    if (/features\/catalog/.test(file))
      addBrowser(
        /catalog|combo|modifier|promotion|product|subcategor|context-price|availability/,
      );
    if (/\/styles(?:\/|\.css)/.test(file))
      addBrowser(/foundation|commercial-dashboard|^pos\.spec/);
  }
  if (!manual && productionPhp.length && !backend.size)
    throw new Error(
      "Faltan pruebas relacionadas: añade una regresión o amplía el selector de CI.",
    );
  if (!manual && productionFrontend.length && !browser.size)
    throw new Error(
      "Falta recorrido del módulo: añade su prueba o amplía el selector de CI.",
    );
  const composerChanged = files.some((file) =>
    /^backend\/composer\.(json|lock)$/.test(file),
  );
  const backendFilter = manual ? filter : [...backend].sort().join("|");
  const browserSpecs = manual ? requested : [...browser].sort();
  // Split related tests to retain the runner's validated 200-character contract.
  // Runtime dependency changes justify a complete SQL run, without duplicating SQLite.
  const sqlAll = full || (!manual && composerChanged);
  const filters = [];
  if (!sqlAll && backendFilter) {
    for (const name of backendFilter.split("|")) {
      if (!filters.length || filters.at(-1).length + name.length + 1 > 200)
        filters.push(name);
      else filters[filters.length - 1] += "|" + name;
    }
  }
  return {
    ci_changed: infrastructure,
    php_files: phpFiles,
    frontend_files: frontendFiles,
    backend_check:
      full || infrastructure || phpFiles.length > 0 || composerChanged,
    frontend_check:
      full || infrastructure || frontendFiles.length > 0 || dependencyChange,
    sql_mode: sqlAll ? "full" : backendFilter ? "targeted" : "off",
    backend_filter: sqlAll ? "" : backendFilter,
    backend_filters: filters,
    sqlite_full: full,
    browser_mode:
      full || dependencyChange
        ? "full"
        : browserSpecs.length
          ? "targeted"
          : "off",
    browser_specs: browserSpecs,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const head = process.env.GITHUB_SHA;
  const base = event.pull_request?.base.sha ?? event.before;
  if (!/^[a-f0-9]{40}$/.test(head ?? "")) throw new Error("HEAD inválido.");
  const files =
    /^[a-f0-9]{40}$/.test(base ?? "") && !/^0+$/.test(base)
      ? git("diff", "--name-only", "-z", base, head).split("\0").filter(Boolean)
      : git("ls-files", "-z").split("\0").filter(Boolean);
  let dependencyChange = false;
  for (const file of ["frontend/package.json", "frontend/package-lock.json"]) {
    if (!files.includes(file)) continue;
    try {
      dependencyChange ||=
        JSON.stringify(
          normalizeManifest(
            JSON.parse(git("show", `${base}:${file}`)),
            file.endsWith("lock.json"),
          ),
        ) !==
        JSON.stringify(
          normalizeManifest(
            JSON.parse(readFileSync(file, "utf8")),
            file.endsWith("lock.json"),
          ),
        );
    } catch {
      dependencyChange = true;
    }
  }
  const manual = process.env.GITHUB_EVENT_NAME === "workflow_dispatch";
  const plan = makePlan(files, {
    manual,
    full: manual && event.inputs?.scope === "full",
    filter: manual ? (event.inputs?.backend_filter ?? "") : "",
    specs: manual ? (event.inputs?.playwright_specs ?? "") : "",
    dependencyChange,
  });
  const npmKey = createHash("sha256")
    .update(
      JSON.stringify(
        normalizeManifest(
          JSON.parse(readFileSync("frontend/package-lock.json", "utf8")),
          true,
        ),
      ),
    )
    .digest("hex");
  plan.npm_key = npmKey;
  for (const [key, value] of Object.entries(plan))
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `${key}=${typeof value === "object" ? JSON.stringify(value) : value}\n`,
    );
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `Validación seleccionada: SQL **${plan.sql_mode}**, SQLite completo **${plan.sqlite_full}**, navegador **${plan.browser_mode}**. Las suites omitidas no se consideran ejecutadas.\n`,
  );
  console.log(JSON.stringify(plan));
}
