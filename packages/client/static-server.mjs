/**
 * Zero-dependency static file server for Azure App Service (Linux/Windows).
 * Serves Vite build output and falls back to index.html for SPA routes.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = process.env.STATIC_ROOT
  ? process.env.STATIC_ROOT
  : join(__dirname, "dist");
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

function safePath(urlPath) {
  const decoded = decodeURIComponent((urlPath || "/").split("?")[0] || "/");
  const cleaned = normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, "");
  const rel = cleaned.replace(/^[/\\]+/, "");
  return join(ROOT, rel || "index.html");
}

async function readMaybe(file) {
  try {
    const st = await stat(file);
    if (st.isDirectory()) return null;
    return await readFile(file);
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, app: "loose-cannon-client" }));
    return;
  }

  let file = safePath(req.url || "/");
  let body = await readMaybe(file);
  if (!body) {
    // directory or missing → try index.html in path, then SPA fallback
    body = await readMaybe(join(file, "index.html"));
  }
  if (!body) {
    body = await readMaybe(join(ROOT, "index.html"));
    file = join(ROOT, "index.html");
  }
  if (!body) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }

  const ext = extname(file).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control":
      ext === ".html" || ext === ""
        ? "no-cache"
        : "public, max-age=86400",
  });
  res.end(body);
});

server.listen(PORT, HOST, () => {
  console.log(`Loose Cannon client static server on http://${HOST}:${PORT} (root=${ROOT})`);
});
