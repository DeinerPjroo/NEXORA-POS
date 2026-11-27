import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const frontend = fileURLToPath(new URL("../frontend/", import.meta.url));
const args = process.argv.slice(2);
const portArgument =
  args.find((arg) => arg.startsWith("--port="))?.slice(7) ??
  (args.includes("--port") ? args[args.indexOf("--port") + 1] : "5174");
const port = Number(portArgument);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("El puerto de desarrollo no es válido.");
  process.exit(1);
}
const url = `http://127.0.0.1:${port}`;
let occupied = true;
try {
  const response = await fetch(`${url}/__nexora_dev`, {
    signal: AbortSignal.timeout(2500),
  });
  const marker =
    response.ok &&
    response.headers.get("content-type")?.includes("application/json")
      ? await response.json()
      : null;
  if (
    marker?.application === "nexora-pos" &&
    marker?.kind === "vite-development"
  ) {
    console.log(`Nexora ya está en ejecución: ${url}/ingresar`);
    console.log(
      "No hace falta iniciar otro servidor. Mantén abierta la terminal que lo inició.",
    );
    process.exit(0);
  }
} catch (error) {
  occupied = error.cause?.code !== "ECONNREFUSED";
}
if (occupied) {
  console.error(
    `El puerto ${port} está ocupado o no responde como Nexora. No se detuvo ningún proceso.`,
  );
  process.exit(1);
}
const child = spawn(
  process.execPath,
  [
    resolve(frontend, "node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
    ...args,
  ],
  {
    cwd: frontend,
    stdio: "inherit",
    windowsHide: true,
  },
);
child.on("error", (error) => {
  console.error(`No se pudo iniciar Nexora: ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 0;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
