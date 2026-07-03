#!/usr/bin/env node
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { readFile } from "node:fs/promises";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");
const distRoot = resolve(projectRoot, "dist");
const args = new Map(
  process.argv.slice(2).flatMap((arg, index, allArgs) => {
    if (!arg.startsWith("--")) {
      return [];
    }

    const [key, inlineValue] = arg.slice(2).split("=");
    const value = inlineValue ?? allArgs[index + 1] ?? "";
    return [[key, value]];
  })
);

if (args.has("help")) {
  console.log("Usage: agentdesk [--port 5173] [--host 127.0.0.1]");
  process.exit(0);
}

const port = validatePort(args.get("port") || process.env.AGENTDESK_PORT || "5173");
const host = validateHost(args.get("host") || process.env.AGENTDESK_HOST || "127.0.0.1");

if (!existsSync(join(distRoot, "index.html"))) {
  console.error("AgentDesk dist build not found. Run `npm run build` before starting the packaged CLI.");
  process.exit(1);
}

const server = createServer(async (request, response) => {
  let requestedPath = "/";

  try {
    requestedPath = decodeURIComponent(new URL(request.url ?? "/", `http://${host}`).pathname);
  } catch {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Bad Request");
    return;
  }

  const safePath = normalize(requestedPath.replace(/^\/+/, "") || "index.html").replace(
    /^(\.\.[\\/])+/,
    ""
  );
  const filePath = resolve(distRoot, safePath);

  if (!filePath.startsWith(distRoot)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  const targetPath =
    existsSync(filePath) && statSync(filePath).isFile() ? filePath : join(distRoot, "index.html");
  response.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' http://127.0.0.1:11434 http://localhost:11434");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Content-Type", contentType(targetPath));
  createReadStream(targetPath)
    .on("error", async () => {
      response.writeHead(500);
      response.end(await readFile(join(distRoot, "index.html"), "utf8"));
    })
    .pipe(response);
});

server.listen(Number(port), host, () => {
  console.log(`AgentDesk is running at http://${host}:${port}`);
});

server.on("error", (error) => {
  console.error(`Unable to start AgentDesk: ${error.message}`);
  process.exit(1);
});

function validatePort(value) {
  const portNumber = Number(value);

  if (!Number.isInteger(portNumber) || portNumber < 1024 || portNumber > 65535) {
    console.error("AGENTDESK_PORT must be an integer between 1024 and 65535.");
    process.exit(1);
  }

  return String(portNumber);
}

function validateHost(value) {
  if (value !== "127.0.0.1" && value !== "localhost") {
    console.error("AGENTDESK_HOST must be 127.0.0.1 or localhost.");
    process.exit(1);
  }

  return value;
}

function contentType(filePath) {
  switch (extname(filePath)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".json":
      return "application/json; charset=utf-8";
    default:
      return "text/html; charset=utf-8";
  }
}
