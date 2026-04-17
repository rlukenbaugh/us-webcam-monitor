const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const prismaCliPath = require.resolve("prisma/build/index.js", { paths: [rootDir] });
const tsxCliPath = require.resolve("tsx/cli", { paths: [rootDir] });
const legacyDatabasePath = path.join(rootDir, "prisma", "prisma", "dev.db");

for (const envFile of [path.join(rootDir, ".env.local"), path.join(rootDir, ".env")]) {
  if (fs.existsSync(envFile) && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(envFile);
  }
}

function runPrismaCommand(args) {
  const result = spawnSync(process.execPath, [prismaCliPath, ...args], {
    cwd: rootDir,
    env: {
      ...process.env,
      DATABASE_URL: "file:./dev.db"
    },
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runNodeScript(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: {
      ...process.env,
      DATABASE_URL: "file:./dev.db"
    },
    stdio: "inherit"
  });

  if (result.status !== 0) {
    console.warn(`[db-prepare] Non-fatal script failure: ${command} ${args.join(" ")}`);
  }
}

if (fs.existsSync(legacyDatabasePath)) {
  fs.unlinkSync(legacyDatabasePath);
}

runPrismaCommand(["db", "push", "--skip-generate"]);
runPrismaCommand(["db", "seed"]);
runNodeScript(process.execPath, [tsxCliPath, "scripts/import-adapters.ts"]);
