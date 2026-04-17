import fs from "fs";
import path from "path";
import { CameraCategory, Prisma, PrismaClient, SourceType, SubmissionStatus } from "@prisma/client";
import { inferStreamType, normalizeUrl } from "../src/lib/adapters/utils";
import { parseCsvLine } from "../src/lib/importers/webcam-finder-import";

for (const envFile of [path.resolve(process.cwd(), ".env.local"), path.resolve(process.cwd(), ".env")]) {
  if (fs.existsSync(envFile) && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(envFile);
  }
}

process.env.DATABASE_URL = process.env.DATABASE_URL || "file:./dev.db";

const prisma = new PrismaClient();
const DEFAULT_PREVIEW_PATH = "data/generated/public_webcam_import_preview.json";

type CsvRow = {
  title: string;
  region_hint?: string;
  page_url: string;
  embed_urls: string;
  source_site?: string;
  location_hint?: string;
};

type InferredLocation = {
  latitude: number;
  longitude: number;
  city: string | null;
  stateCode: string | null;
  countryCode: string;
};

type ImportPreview = {
  row: CsvRow;
  candidate: {
    title: string;
    sourceUrl: string;
    embedUrl: string | null;
    imageUrl: string | null;
    latitude: number;
    longitude: number;
    city: string | null;
    stateCode: string | null;
    category: CameraCategory;
    notes: string;
    raw: Prisma.InputJsonValue;
  } | null;
  skippedReason: string | null;
};

const SPAIN_LOCATION_HINTS: Array<{ pattern: RegExp; location: InferredLocation }> = [
  { pattern: /\bbarcelona\b|\bbarceloneta\b/i, location: { latitude: 41.3851, longitude: 2.1734, city: "Barcelona", stateCode: null, countryCode: "ES" } },
  { pattern: /\bmallorca\b|\bpalma\b/i, location: { latitude: 39.5696, longitude: 2.6502, city: "Palma de Mallorca", stateCode: null, countryCode: "ES" } },
  { pattern: /\bibiza\b/i, location: { latitude: 38.9067, longitude: 1.4206, city: "Ibiza", stateCode: null, countryCode: "ES" } },
  { pattern: /\btenerife\b|\badeje\b|\blas americas\b/i, location: { latitude: 28.2916, longitude: -16.6291, city: "Adeje", stateCode: null, countryCode: "ES" } },
  { pattern: /\blanzarote\b/i, location: { latitude: 28.963, longitude: -13.5477, city: "Lanzarote", stateCode: null, countryCode: "ES" } },
  { pattern: /\bgran canaria\b|\blas palmas\b|\bcanteras\b/i, location: { latitude: 28.1235, longitude: -15.4363, city: "Las Palmas de Gran Canaria", stateCode: null, countryCode: "ES" } },
  { pattern: /\bcadiz\b/i, location: { latitude: 36.5271, longitude: -6.2886, city: "Cadiz", stateCode: null, countryCode: "ES" } },
  { pattern: /\bmarbella\b/i, location: { latitude: 36.5101, longitude: -4.8824, city: "Marbella", stateCode: null, countryCode: "ES" } },
  { pattern: /\bmalaga\b/i, location: { latitude: 36.7213, longitude: -4.4214, city: "Malaga", stateCode: null, countryCode: "ES" } },
  { pattern: /\bbenidorm\b/i, location: { latitude: 38.5411, longitude: -0.1225, city: "Benidorm", stateCode: null, countryCode: "ES" } },
  { pattern: /\bla manga\b/i, location: { latitude: 37.6412, longitude: -0.7179, city: "La Manga", stateCode: null, countryCode: "ES" } },
  { pattern: /\bmojacar\b/i, location: { latitude: 37.1391, longitude: -1.8513, city: "Mojacar", stateCode: null, countryCode: "ES" } },
  { pattern: /\btorrevieja\b/i, location: { latitude: 37.978, longitude: -0.6822, city: "Torrevieja", stateCode: null, countryCode: "ES" } },
  { pattern: /\bcalafell\b/i, location: { latitude: 41.2015, longitude: 1.5681, city: "Calafell", stateCode: null, countryCode: "ES" } },
  { pattern: /\bsuances\b/i, location: { latitude: 43.4266, longitude: -4.0432, city: "Suances", stateCode: null, countryCode: "ES" } },
  { pattern: /\bteresitas\b/i, location: { latitude: 28.5033, longitude: -16.1858, city: "Santa Cruz de Tenerife", stateCode: null, countryCode: "ES" } },
  { pattern: /\bvalencia\b/i, location: { latitude: 39.4699, longitude: -0.3763, city: "Valencia", stateCode: null, countryCode: "ES" } },
  { pattern: /\balicante\b/i, location: { latitude: 38.3452, longitude: -0.481, city: "Alicante", stateCode: null, countryCode: "ES" } },
  { pattern: /\bmurcia\b/i, location: { latitude: 37.9922, longitude: -1.1307, city: "Murcia", stateCode: null, countryCode: "ES" } },
  { pattern: /\basturias\b/i, location: { latitude: 43.3619, longitude: -5.8494, city: "Asturias", stateCode: null, countryCode: "ES" } },
  { pattern: /\bcantabria\b/i, location: { latitude: 43.1828, longitude: -3.9878, city: "Cantabria", stateCode: null, countryCode: "ES" } },
  { pattern: /\bgalicia\b/i, location: { latitude: 42.5751, longitude: -8.1339, city: "Galicia", stateCode: null, countryCode: "ES" } }
];

function parseArgs(argv: string[]) {
  const options = {
    input: "",
    commit: false,
    previewPath: DEFAULT_PREVIEW_PATH,
    limit: 0,
    fallbackCity: "",
    fallbackLatitude: Number.NaN,
    fallbackLongitude: Number.NaN,
    fallbackCountryCode: "ES"
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
    if (token === "--country-code" && next) {
      options.fallbackCountryCode = next.toUpperCase();
      index += 1;
      continue;
    }
    if (token === "--commit") {
      options.commit = true;
    }
  }

  if (!options.input) {
    throw new Error("Missing required --input path");
  }

  return options;
}

function parseCsvRows(input: string): CsvRow[] {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row as CsvRow;
  });
}

function inferCategory(text: string): CameraCategory {
  const lowered = text.toLowerCase();

  if (/\b(beach|playa|surf|coast|costa|shore|seaside|ocean|sea)\b/.test(lowered)) {
    return CameraCategory.BEACH;
  }
  if (/\b(harbor|harbour|marina|port|bay)\b/.test(lowered)) {
    return CameraCategory.HARBOR;
  }
  return CameraCategory.TOURISM;
}

function splitEmbedUrls(value: string) {
  return value
    .split("|")
    .map((item) => normalizeUrl(item.trim()))
    .filter((item): item is string => Boolean(item));
}

function inferLocation(row: CsvRow, fallback: InferredLocation | null) {
  const searchable = `${row.title} ${row.region_hint ?? ""} ${row.location_hint ?? ""} ${row.page_url}`.toLowerCase();

  for (const hint of SPAIN_LOCATION_HINTS) {
    if (hint.pattern.test(searchable)) {
      return hint.location;
    }
  }

  return fallback;
}

function toJsonValue(row: CsvRow, category: CameraCategory, location: InferredLocation | null) {
  return {
    importedFrom: "public_webcam_crawler_csv",
    row,
    inferredCategory: category,
    inferredLocation: location,
    importedAt: new Date().toISOString()
  } as Prisma.InputJsonValue;
}

function buildCandidate(row: CsvRow, fallbackLocation: InferredLocation | null): ImportPreview {
  const location = inferLocation(row, fallbackLocation);
  if (!location) {
    return {
      row,
      candidate: null,
      skippedReason: "No inferred or fallback location was available"
    };
  }

  const embedUrls = splitEmbedUrls(row.embed_urls);
  const imageUrl =
    embedUrls.find((url) => inferStreamType(url) === "jpeg") ?? null;
  const embedUrl =
    embedUrls.find((url) => {
      const streamType = inferStreamType(url);
      return streamType !== "jpeg";
    }) ?? null;
  const category = inferCategory(`${row.title} ${row.region_hint ?? ""} ${row.page_url}`);

  return {
    row,
    skippedReason: null,
    candidate: {
      title: row.title.trim() || "Imported Public Webcam",
      sourceUrl: row.page_url,
      embedUrl,
      imageUrl,
      latitude: location.latitude,
      longitude: location.longitude,
      city: location.city,
      stateCode: location.stateCode,
      category,
      notes: [
        "Imported from public webcam crawler CSV.",
        `Region hint: ${row.region_hint || row.location_hint || "unknown"}`,
        `Source site: ${row.source_site || "unknown"}`,
        `Embeds found: ${embedUrls.length}`
      ].join(" "),
      raw: toJsonValue(row, category, location)
    }
  };
}

async function ensureCrawlerSource() {
  return prisma.source.upsert({
    where: { key: "public-webcam-crawler-import" },
    update: {
      name: "Public Webcam Crawler Imports",
      type: SourceType.MANUAL,
      baseUrl: "file-import://public-webcam-crawler",
      attribution: "Imported from public crawler CSV output"
    },
    create: {
      key: "public-webcam-crawler-import",
      name: "Public Webcam Crawler Imports",
      type: SourceType.MANUAL,
      baseUrl: "file-import://public-webcam-crawler",
      attribution: "Imported from public crawler CSV output"
    }
  });
}

async function commitImport(previews: ImportPreview[]) {
  const source = await ensureCrawlerSource();
  let inserted = 0;
  let duplicatesSkipped = 0;

  for (const preview of previews) {
    const candidate = preview.candidate;
    if (!candidate) {
      continue;
    }

    const existing = await prisma.submission.findFirst({
      where: {
        sourceId: source.id,
        title: candidate.title,
        sourceUrl: candidate.sourceUrl,
        latitude: candidate.latitude,
        longitude: candidate.longitude
      },
      select: { id: true }
    });

    if (existing) {
      duplicatesSkipped += 1;
      continue;
    }

    await prisma.submission.create({
      data: {
        sourceId: source.id,
        title: candidate.title,
        sourceUrl: candidate.sourceUrl,
        embedUrl: candidate.embedUrl,
        imageUrl: candidate.imageUrl,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        stateCode: candidate.stateCode,
        city: candidate.city,
        category: candidate.category,
        notes: candidate.notes,
        status: SubmissionStatus.NEEDS_REVIEW,
        raw: candidate.raw
      }
    });

    inserted += 1;
  }

  return {
    inserted,
    duplicatesSkipped
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const csvInput = fs.readFileSync(options.input, "utf-8");
  const rows = parseCsvRows(csvInput);
  const limitedRows = options.limit > 0 ? rows.slice(0, options.limit) : rows;
  const fallbackLocation =
    Number.isFinite(options.fallbackLatitude) && Number.isFinite(options.fallbackLongitude)
      ? {
          latitude: options.fallbackLatitude,
          longitude: options.fallbackLongitude,
          city: options.fallbackCity || null,
          stateCode: null,
          countryCode: options.fallbackCountryCode
        }
      : null;

  const previews = limitedRows.map((row) => buildCandidate(row, fallbackLocation));
  const previewPath = path.resolve(options.previewPath);
  fs.mkdirSync(path.dirname(previewPath), { recursive: true });
  fs.writeFileSync(previewPath, JSON.stringify(previews, null, 2), "utf-8");

  let inserted = 0;
  let duplicatesSkipped = 0;

  if (options.commit) {
    const result = await commitImport(previews);
    inserted = result.inserted;
    duplicatesSkipped = result.duplicatesSkipped;
  }

  console.log(
    JSON.stringify(
      {
        input: options.input,
        previewPath,
        totalRows: limitedRows.length,
        commitReady: previews.filter((preview) => preview.candidate !== null).length,
        skipped: previews.filter((preview) => preview.candidate === null).length,
        inserted,
        duplicatesSkipped,
        mode: options.commit ? "commit" : "dry-run"
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
