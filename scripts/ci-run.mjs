import { spawnSync } from "node:child_process";
import { constants, copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

if (process.env.GITHUB_ACTIONS !== "true")
  throw new Error(
    "Este ejecutor solo prepara el entorno efímero de GitHub Actions.",
  );
const mode = process.argv[2];
function run(command, args, cwd = ".", env = {}) {
  const result = spawnSync(command, args, {
    cwd: resolve(cwd),
    env: { ...process.env, ...env },
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (mode === "prepare") {
  if (existsSync("backend/.env"))
    throw new Error("No se sobrescribe un archivo .env existente.");
  copyFileSync("backend/.env.example", "backend/.env", constants.COPYFILE_EXCL);
  run("php", ["artisan", "key:generate", "--force"], "backend");
} else if (mode === "backend-check") {
  run("composer", ["validate", "--no-check-publish"], "backend");
  const paths = JSON.parse(process.env.PHP_FILES ?? "[]");
  for (const path of paths) {
    if (!/^(backend|scripts)\/.+\.php$/.test(path) || path.includes(".."))
      throw new Error("Ruta PHP inválida.");
    run("php", ["-l", `./${path}`]);
  }
  const backend = paths
    .filter((path) => path.startsWith("backend/"))
    .map((path) => "./" + path.slice(8));
  if (backend.length)
    run(
      "php",
      [
        "vendor/bin/pint",
        "--test",
        ...(backend.length ? ["--", ...backend] : []),
      ],
      "backend",
    );
  if (process.env.CI_CHANGED === "true")
    run("node", ["--test", "scripts/ci-plan.test.mjs"]);
} else if (mode === "frontend-check") {
  run("npm", ["run", "build"], "frontend");
  const paths = JSON.parse(process.env.FRONTEND_FILES ?? "[]");
  if (
    paths.some(
      (path) =>
        !/^frontend\/(src|e2e)\/.+\.(tsx?|css)$/.test(path) ||
        path.includes(".."),
    )
  )
    throw new Error("Ruta frontend inválida.");
  if (paths.length)
    run(
      "node",
      [
        "node_modules/prettier/bin/prettier.cjs",
        "--check",
        "--",
        ...paths.map((path) => "./" + path.slice(9)),
      ],
      "frontend",
    );
} else if (mode === "sql") {
  const filters = JSON.parse(process.env.BACKEND_FILTERS ?? "[]");
  if (process.env.SQL_MODE === "full") run("php", ["scripts/test-mysql.php"]);
  else {
    if (process.env.SQL_MODE !== "targeted" || !filters.length)
      throw new Error("Alcance SQL vacío o inválido.");
    for (const filter of filters) {
      if (!/^[A-Za-z0-9_:|.]{1,200}$/.test(filter))
        throw new Error("Filtro inválido.");
      run("php", ["scripts/test-mysql.php", `--filter=${filter}`]);
    }
  }
} else if (mode === "sqlite") {
  run("php", ["artisan", "test"], "backend", {
    DB_CONNECTION: "sqlite",
    DB_DATABASE: ":memory:",
    DB_URL: "",
    SESSION_DRIVER: "array",
    CACHE_STORE: "array",
    MAIL_MAILER: "array",
    BCRYPT_ROUNDS: "4",
  });
} else if (mode === "browser") {
  const specs = JSON.parse(process.env.BROWSER_SPECS ?? "[]");
  for (const spec of specs)
    if (
      !/^[a-z0-9][a-z0-9-]*\.spec\.ts$/.test(spec) ||
      !existsSync(`frontend/e2e/${spec}`)
    )
      throw new Error("Prueba de navegador inválida.");
  run(
    "node",
    [
      "node_modules/@playwright/test/cli.js",
      "test",
      ...(process.env.BROWSER_MODE === "full" ? [] : specs),
    ],
    "frontend",
  );
} else throw new Error("Modo CI no permitido.");
