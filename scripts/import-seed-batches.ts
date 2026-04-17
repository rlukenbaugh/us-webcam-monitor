import { SubmissionStatus } from "@prisma/client";
import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db/prisma";
import {
  commitSeedImport,
  ensureSeedImportSource,
  prepareSeedImport
} from "@/lib/importers/seed-dataset-import";

type CliOptions = {
  dir: string;
  limit?: number;
  commit: boolean;
  bulkApprove: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  let dir = path.resolve(process.cwd(), "data/generated/webcam_seed_batches");
  let limit: number | undefined;
  let commit = false;
  let bulkApprove = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dir" && argv[index + 1]) {
      dir = path.resolve(process.cwd(), argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--limit" && argv[index + 1]) {
      const numeric = Number(argv[index + 1]);
      if (Number.isFinite(numeric) && numeric > 0) {
        limit = numeric;
      }
      index += 1;
      continue;
    }

    if (arg === "--commit") {
      commit = true;
    }

    if (arg === "--bulk-approve") {
      bulkApprove = true;
    }
  }

  return {
    dir,
    limit,
    commit,
    bulkApprove
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const entries = await fs.readdir(options.dir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => path.join(options.dir, entry.name))
    .sort((left, right) => left.localeCompare(right));

  if (files.length === 0) {
    throw new Error(`No JSON seed batch files found in ${options.dir}`);
  }

  const inputs = await Promise.all(files.map((file) => fs.readFile(file, "utf8")));
  const prepared = prepareSeedImport(inputs, {
    limit: options.limit
  });

  let inserted = 0;
  let duplicatesSkipped = 0;
  let bulkApproved = 0;

  if (options.commit) {
    const result = await commitSeedImport(prisma, prepared.previews);
    inserted = result.inserted;
    duplicatesSkipped = result.duplicatesSkipped;

    if (options.bulkApprove) {
      const source = await ensureSeedImportSource(prisma);
      const updated = await prisma.submission.updateMany({
        where: {
          sourceId: source.id,
          status: SubmissionStatus.NEEDS_REVIEW
        },
        data: {
          status: SubmissionStatus.PENDING,
          reviewedAt: new Date(),
          reviewedBy: "desktop-admin",
          moderationNotes: "Bulk approved for later promotion from seed dataset import."
        }
      });
      bulkApproved = updated.count;
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: options.commit ? "commit" : "dry-run",
        directory: options.dir,
        filesProcessed: files.length,
        totalRows: prepared.rows.length,
        commitReady: prepared.commitReady.length,
        skipped: prepared.skipped.length,
        inserted,
        duplicatesSkipped,
        bulkApproved
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
