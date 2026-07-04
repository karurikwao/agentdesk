import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const localRefs = new Set();
const pages = ["index.html", "project-launch.html"];

for (const page of pages) {
  const pagePath = resolve(root, "docs", page);
  const html = await readFile(pagePath, "utf8");
  const pageDir = dirname(pagePath);

  for (const match of html.matchAll(/\b(?:src|href|content)=["']([^"']+)["']/g)) {
    const ref = match[1].trim();

    if (
      ref.startsWith("http://") ||
      ref.startsWith("https://") ||
      ref.startsWith("#") ||
      ref.startsWith("mailto:")
    ) {
      continue;
    }

    if (ref.startsWith("./") || ref.startsWith("assets/")) {
      localRefs.add(`${pageDir}\0${ref.replace(/^\.\//, "")}`);
    }
  }
}

const missing = [];

for (const entry of localRefs) {
  const [pageDir, ref] = entry.split("\0");
  const filePath = resolve(pageDir, ref);

  try {
    const result = await stat(filePath);
    if (!result.isFile()) {
      missing.push(ref);
    }
  } catch {
    missing.push(ref);
  }
}

if (missing.length > 0) {
  throw new Error(`Missing launch page reference(s): ${missing.join(", ")}`);
}

console.log(`Launch page references verified: ${localRefs.size} across ${pages.length} pages`);
