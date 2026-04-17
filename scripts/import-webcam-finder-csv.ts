import { PrismaClient } from "@prisma/client";
import {
  commitFinderImport,
  type InferredLocation,
  prepareFinderImport
} from "../src/lib/importers/webcam-finder-import";

process.env.DATABASE_URL = process.env.DATABASE_URL || "file:./dev.db";

const prisma = new PrismaClient();
const DEFAULT_PREVIEW_PATH = "data/generated/webcam_finder_import_preview.json";

function parseArgs(argv: string[]) {
  const options = {
    input: "",
    commit: false,
    previewPath: DEFAULT_PREVIEW_PATH,
    limit: 0,
    fallbackStateCode: "",
    fallbackCity: "",
    fallbackLatitude: Number.NaN,
    fallbackLongitude: Number.NaN
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === "--input" && next) {
      options.input = next;
      index += 1;
      continue;
    }
    if (token === "--preview-path" && next) {
      options.previewPath = next;
      index += 1;
      continue;
    }
    if (token === "--limit" && next) {
      options.limit = Number(next);
      index += 1;
      continue;
    }
    if (token === "--state-code" && next) {
      options.fallbackStateCode = next.toUpperCase();
      index += 1;
      continue;
    }
    if (token === "--city" && next) {
      options.fallbackCity = next;
      index += 1;
      continue;
    }
    if (token === "--lat" && next) {
      options.fallbackLatitude = Number(next);
      index += 1;
      continue;
    }
    if (token === "--lng" && next) {
      options.fallbackLongitude = Number(next);
      index += 1;
      continue;
    }
    if (token === "--commit") {
      options.commit = true;
      continue;
    }
  }

  if (!options.input) {
    throw new Error("Missing required --input path");
  }

  return options;
}

async function main() {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const options = parseArgs(process.argv.slice(2));
  const fallbackLocation: InferredLocation | null =
    Number.isFinite(options.fallbackLatitude) && Number.isFinite(options.fallbackLongitude)
      ? {
          latitude: options.fallbackLatitude,
          longitude: options.fallbackLongitude,
          stateCode: options.fallbackStateCode || null,
          city: options.fallbackCity || null
        }
      : null;

  const csvInput = await fs.readFile(options.input, "utf-8");
  const prepared = prepareFinderImport(csvInput, {
    limit: options.limit,
    fallbackLocation
  });

  const previewPath = path.resolve(options.previewPath);
  await fs.mkdir(path.dirname(previewPath), { recursive: true });
  await fs.writeFile(previewPath, JSON.stringify(prepared.previews, null, 2), "utf-8");

  let inserted = 0;
  let duplicatesSkipped = 0;

  if (options.commit) {
    const result = await commitFinderImport(prisma, prepared.previews);
    inserted = result.inserted;
    duplicatesSkipped = result.duplicatesSkipped;
  }

  console.log(
    JSON.stringify(
      {
        input: options.input,
        previewPath,
        totalRows: prepared.rows.length,
        commitReady: prepared.commitReady.length,
        skipped: prepared.skipped.length,
        inserted,
        duplicatesSkipped,
        mode: options.commit ? "commit" : "dry-run"
      },
      null,
      2
    )
  );

  if (prepared.skipped.length > 0) {
    console.log("Skipped rows require a fallback location or manual review.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
