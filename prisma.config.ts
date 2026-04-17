import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "prisma/config";

const rootDir = process.cwd();
const localEnvPath = path.join(rootDir, ".env.local");
const defaultEnvPath = path.join(rootDir, ".env");

if (fs.existsSync(localEnvPath)) {
  process.loadEnvFile(localEnvPath);
}

if (fs.existsSync(defaultEnvPath)) {
  process.loadEnvFile(defaultEnvPath);
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts"
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "file:./dev.db"
  }
});
