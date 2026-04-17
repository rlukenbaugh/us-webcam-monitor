import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const outIndex = process.argv.indexOf("--out");

if (outIndex === -1 || !process.argv[outIndex + 1]) {
  throw new Error("Usage: node scripts/render-release-notes.mjs --out <output-file>");
}

const outFile = path.resolve(rootDir, process.argv[outIndex + 1]);
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
const template = fs.readFileSync(path.join(rootDir, "docs", "release-notes-template.md"), "utf8");

const rendered = template
  .replaceAll("{{VERSION}}", packageJson.version)
  .replaceAll("{{REPO_URL}}", packageJson.repository.url.replace(/\.git$/, ""));

fs.writeFileSync(outFile, rendered);
