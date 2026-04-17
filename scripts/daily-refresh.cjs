const path = require("path");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const tsxCliPath = require.resolve("tsx/cli", { paths: [rootDir] });

for (const envFile of [path.join(rootDir, ".env.local"), path.join(rootDir, ".env")]) {
  if (require("fs").existsSync(envFile) && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(envFile);
  }
}

function runScript(scriptPath) {
  const result = spawnSync(process.execPath, [tsxCliPath, scriptPath], {
    cwd: rootDir,
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL || "file:./dev.db"
    },
    stdio: "inherit"
  });

  if (result.status !== 0) {
    throw new Error(`Failed running ${scriptPath}`);
  }
}

function runOptionalNodeScript(scriptPath) {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: rootDir,
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL || "file:./dev.db"
    },
    stdio: "inherit"
  });

  if (result.status !== 0) {
    console.warn(`[daily-refresh] optional step failed: ${scriptPath}`);
  }
}

try {
  runScript("scripts/import-adapters.ts");
  runScript("scripts/check-camera-images.ts");
  runOptionalNodeScript(path.join(rootDir, "scripts", "daily-webcam-discovery.cjs"));
  console.log("[daily-refresh] completed");
} catch (error) {
  console.error("[daily-refresh] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
