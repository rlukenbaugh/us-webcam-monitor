import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { syncAllRegisteredSources } from "../src/lib/sources/source-sync";

for (const envFile of [path.resolve(process.cwd(), ".env.local"), path.resolve(process.cwd(), ".env")]) {
  if (fs.existsSync(envFile) && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(envFile);
  }
}

process.env.DATABASE_URL = process.env.DATABASE_URL || "file:./dev.db";

const prisma = new PrismaClient();

async function main() {
  const results = await syncAllRegisteredSources(prisma);

  for (const result of results) {
    console.log(
      `[adapter-import] ${result.sourceKey}: status=${result.status.toLowerCase()} fetched=${result.fetchedCount} normalized=${result.normalizedCount} inserted=${result.insertedCount} updated=${result.updatedCount} errors=${result.errors.length}`
    );
  }
}

main()
  .catch((error) => {
    console.warn(
      `[adapter-import] Build-time import finished with non-fatal error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
