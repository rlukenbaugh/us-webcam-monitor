const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const tsxCliPath = require.resolve("tsx/cli", { paths: [rootDir] });

for (const envFile of [path.join(rootDir, ".env.local"), path.join(rootDir, ".env")]) {
  if (fs.existsSync(envFile) && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(envFile);
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd || rootDir,
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL || "file:./dev.db"
    },
    stdio: "inherit"
  });
}

function hasPython() {
  const result = spawnSync("python", ["--version"], {
    cwd: rootDir,
    stdio: "pipe"
  });
  return result.status === 0;
}

function runPythonCrawler(scriptName, outputDir) {
  ensureDir(outputDir);
  return run("python", [path.join(rootDir, "scripts", scriptName)], { cwd: outputDir });
}

function runCsvImport(csvPath, previewPath) {
  return run(process.execPath, [
    tsxCliPath,
    "scripts/import-public-webcam-csv.ts",
    "--input",
    csvPath,
    "--commit",
    "--preview-path",
    previewPath
  ]);
}

function main() {
  const summary = [];

  if (!hasPython()) {
    console.log("[daily-discovery] Python is not available. Skipping crawler discovery.");
    return;
  }

  const discoveryRoot = path.join(rootDir, "data", "generated", "daily-discovery");
  const runs = [
    {
      label: "public",
      script: "webcam_public_crawler.py",
      csv: "webcams_public.csv",
      preview: "public-preview.json"
    },
    {
      label: "spain-beaches",
      script: "spain_beach_webcam_crawler.py",
      csv: "spain_beach_webcams.csv",
      preview: "spain-beaches-preview.json"
    }
  ];

  for (const item of runs) {
    const outputDir = path.join(discoveryRoot, item.label);
    console.log(`[daily-discovery] crawling ${item.label}`);
    const crawlResult = runPythonCrawler(item.script, outputDir);

    if (crawlResult.status !== 0) {
      console.warn(`[daily-discovery] crawler failed for ${item.label}`);
      summary.push({ label: item.label, status: "crawler_failed" });
      continue;
    }

    const csvPath = path.join(outputDir, item.csv);
    if (!fs.existsSync(csvPath)) {
      console.warn(`[daily-discovery] expected CSV not found for ${item.label}: ${csvPath}`);
      summary.push({ label: item.label, status: "missing_csv" });
      continue;
    }

    console.log(`[daily-discovery] importing ${item.label}`);
    const importResult = runCsvImport(csvPath, path.join(outputDir, item.preview));
    if (importResult.status !== 0) {
      console.warn(`[daily-discovery] importer failed for ${item.label}`);
      summary.push({ label: item.label, status: "import_failed", csvPath });
      continue;
    }

    summary.push({ label: item.label, status: "imported", csvPath });
  }

  const summaryPath = path.join(discoveryRoot, "summary.json");
  ensureDir(path.dirname(summaryPath));
  fs.writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        runs: summary
      },
      null,
      2
    ),
    "utf-8"
  );

  console.log(`[daily-discovery] wrote summary to ${summaryPath}`);
}

main();
