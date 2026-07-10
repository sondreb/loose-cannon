/**
 * Builds production deploy packages for Azure App Service (code deploy, not containers).
 *
 * Outputs:
 *   deploy/server/  — bundled Node WebSocket game server (ws + in-memory world)
 *   deploy/client/  — Vite SPA + tiny static server
 *
 * Env:
 *   VITE_WS_URL — WebSocket URL baked into the client (default: beta Azure server)
 */
import { build } from "esbuild";
import { cp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const deployRoot = join(root, "deploy");
const serverOut = join(deployRoot, "server");
const clientOut = join(deployRoot, "client");

const WS_URL =
  process.env.VITE_WS_URL || "wss://loose-cannon-beta-server.azurewebsites.net";

function run(cmd, args, env = {}) {
  console.log(`> ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...env },
    shell: process.platform === "win32",
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

async function prepareServer() {
  await rm(serverOut, { recursive: true, force: true });
  await mkdir(serverOut, { recursive: true });

  console.log("\n=== Bundle server (esbuild) ===");
  await build({
    entryPoints: [join(root, "packages/server/src/index.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    outfile: join(serverOut, "index.js"),
    // Keep ws external so native optional deps resolve from node_modules
    external: ["ws"],
    sourcemap: true,
    logLevel: "info",
  });

  const pkg = {
    name: "loose-cannon-server",
    private: true,
    version: "0.1.0",
    type: "module",
    engines: { node: ">=20" },
    scripts: {
      start: "node index.js",
    },
    dependencies: {
      ws: "^8.18.1",
    },
  };
  await writeFile(join(serverOut, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

  console.log("\n=== npm install server production deps ===");
  const inst = spawnSync("npm", ["install", "--omit=dev", "--no-audit", "--no-fund"], {
    cwd: serverOut,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (inst.status !== 0) process.exit(inst.status ?? 1);

  await writeFile(
    join(serverOut, "web.config"),
    `<?xml version="1.0" encoding="utf-8"?>
<!-- IISNode / Azure Windows fallback; Linux uses npm start -->
<configuration>
  <system.webServer>
    <handlers>
      <add name="iisnode" path="index.js" verb="*" modules="iisnode"/>
    </handlers>
    <rewrite>
      <rules>
        <rule name="Node">
          <match url="/*" />
          <action type="Rewrite" url="index.js" />
        </rule>
      </rules>
    </rewrite>
    <webSocket enabled="true" />
  </system.webServer>
</configuration>
`,
  );

  console.log("Server package ready:", serverOut);
}

async function prepareClient() {
  await rm(clientOut, { recursive: true, force: true });
  await mkdir(clientOut, { recursive: true });

  console.log("\n=== Build client (Vite) ===");
  console.log("VITE_WS_URL =", WS_URL);
  run("npm", ["run", "build", "-w", "@loose-cannon/client"], {
    VITE_WS_URL: WS_URL,
  });

  const dist = join(root, "packages/client/dist");
  // Copy built assets to deploy root (static-server serves from cwd/dist or STATIC_ROOT)
  await cp(dist, join(clientOut, "dist"), { recursive: true });
  await cp(join(root, "packages/client/static-server.mjs"), join(clientOut, "static-server.mjs"));

  const pkg = {
    name: "loose-cannon-client",
    private: true,
    version: "0.1.0",
    type: "module",
    engines: { node: ">=20" },
    scripts: {
      start: "node static-server.mjs",
    },
  };
  await writeFile(join(clientOut, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

  // Ensure Vite index is present
  const index = await readFile(join(clientOut, "dist/index.html"), "utf8").catch(() => null);
  if (!index) {
    console.error("Client build missing dist/index.html");
    process.exit(1);
  }

  console.log("Client package ready:", clientOut);
}

await prepareServer();
await prepareClient();
console.log("\nDeploy packages ready under deploy/");
