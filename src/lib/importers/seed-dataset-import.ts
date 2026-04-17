import { CameraCategory, Prisma, PrismaClient, SourceType, SubmissionStatus } from "@prisma/client";

export type SeedDatasetRow = {
  id: string;
  camera_name: string;
  latitude: number;
  longitude: number;
  country: string;
  state_or_region: string | null;
  city: string | null;
  category: string;
  stream_url: string | null;
  stream_type: string;
  source_website: string;
  status: string;
};

export type SeedImportCandidate = {
  title: string;
  sourceUrl: string;
  embedUrl: string | null;
  imageUrl: string | null;
  latitude: number;
  longitude: number;
  stateCode: string | null;
  city: string | null;
  category: CameraCategory;
  notes: string;
  raw: Prisma.InputJsonValue;
  status: SubmissionStatus;
};

export type SeedImportPreview = {
  row: SeedDatasetRow;
  candidate: SeedImportCandidate | null;
  skippedReason: string | null;
};

export type PrepareSeedImportOptions = {
  limit?: number;
};

export type CommitSeedImportResult = {
  inserted: number;
  duplicatesSkipped: number;
};

const US_STATE_CODE_BY_NAME: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY"
};

function normalizeStateCode(country: string, stateOrRegion: string | null): string | null {
  if (!stateOrRegion) {
    return null;
  }

  if (!/^united states$/i.test(country)) {
    return null;
  }

  const trimmed = stateOrRegion.trim();
  if (/^[A-Z]{2}$/.test(trimmed)) {
    return trimmed;
  }

  return US_STATE_CODE_BY_NAME[trimmed.toLowerCase()] ?? null;
}

function mapCategory(category: string): CameraCategory {
  switch (category.trim().toLowerCase()) {
    case "traffic":
      return CameraCategory.TRAFFIC;
    case "beach":
      return CameraCategory.BEACH;
    case "park":
      return CameraCategory.PARK;
    case "weather":
      return CameraCategory.WEATHER;
    case "ski":
      return CameraCategory.SKI;
    case "harbor":
      return CameraCategory.HARBOR;
    case "city":
      return CameraCategory.DOWNTOWN;
    case "tourism":
      return CameraCategory.TOURISM;
    case "town":
      return CameraCategory.OTHER;
    default:
      return CameraCategory.OTHER;
  }
}

function normalizeCountryCode(country: string): string {
  const lowered = country.trim().toLowerCase();
  if (lowered === "united states") {
    return "US";
  }
  if (lowered === "united kingdom") {
    return "GB";
  }
  if (lowered === "norway") {
    return "NO";
  }
  if (lowered === "sweden") {
    return "SE";
  }
  if (lowered === "germany") {
    return "DE";
  }
  if (lowered === "france") {
    return "FR";
  }
  if (lowered === "italy") {
    return "IT";
  }
  if (lowered === "spain") {
    return "ES";
  }
  if (lowered === "netherlands") {
    return "NL";
  }
  if (lowered === "switzerland") {
    return "CH";
  }
  if (lowered === "austria") {
    return "AT";
  }
  return country.trim().slice(0, 2).toUpperCase() || "US";
}

function buildNotes(row: SeedDatasetRow): string {
  return [
    "Imported from structured webcam seed dataset.",
    "This record is synthetic seed data and requires moderator verification before live promotion.",
    `Seed id: ${row.id}`,
    `Country: ${row.country}`,
    `Region: ${row.state_or_region ?? "unknown"}`,
    `City: ${row.city ?? "unknown"}`,
    `Source website: ${row.source_website}`,
    `Stream type: ${row.stream_type || "UNKNOWN"}`,
    `Seed status: ${row.status || "unknown"}`
  ].join(" ");
}

function buildRaw(row: SeedDatasetRow): Prisma.InputJsonValue {
  return {
    importedFrom: "seed_dataset_json",
    seed: row,
    countryCode: normalizeCountryCode(row.country),
    importedAt: new Date().toISOString()
  } as Prisma.InputJsonValue;
}

function isFiniteCoordinate(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

export function parseSeedDatasetJson(input: string): SeedDatasetRow[] {
  const parsed = JSON.parse(input) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("Seed dataset JSON must be an array of webcam objects");
  }

  return parsed.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`Seed dataset row ${index + 1} is not an object`);
    }

    const row = item as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      camera_name: String(row.camera_name ?? ""),
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      country: String(row.country ?? ""),
      state_or_region: row.state_or_region == null ? null : String(row.state_or_region),
      city: row.city == null ? null : String(row.city),
      category: String(row.category ?? ""),
      stream_url: row.stream_url == null ? null : String(row.stream_url),
      stream_type: String(row.stream_type ?? "UNKNOWN"),
      source_website: String(row.source_website ?? ""),
      status: String(row.status ?? "unknown")
    };
  });
}

export function buildSeedCandidate(row: SeedDatasetRow): SeedImportPreview {
  if (!row.id.trim()) {
    return {
      row,
      candidate: null,
      skippedReason: "Missing seed id"
    };
  }

  if (!row.camera_name.trim()) {
    return {
      row,
      candidate: null,
      skippedReason: "Missing camera name"
    };
  }

  if (!isFiniteCoordinate(row.latitude, -90, 90) || !isFiniteCoordinate(row.longitude, -180, 180)) {
    return {
      row,
      candidate: null,
      skippedReason: "Invalid coordinates"
    };
  }

  if (!row.source_website.trim()) {
    return {
      row,
      candidate: null,
      skippedReason: "Missing source website"
    };
  }

  const normalizedStreamType = row.stream_type.trim().toUpperCase();
  const imageUrl = normalizedStreamType === "IMAGE" ? row.stream_url : null;
  const embedUrl =
    normalizedStreamType === "IMAGE" || !row.stream_url || !row.stream_url.trim() ? null : row.stream_url.trim();

  return {
    row,
    skippedReason: null,
    candidate: {
      title: row.camera_name.trim().slice(0, 120),
      sourceUrl: row.source_website.trim(),
      embedUrl,
      imageUrl,
      latitude: row.latitude,
      longitude: row.longitude,
      stateCode: normalizeStateCode(row.country, row.state_or_region),
      city: row.city?.trim() || null,
      category: mapCategory(row.category),
      notes: buildNotes(row),
      raw: buildRaw(row),
      status: SubmissionStatus.NEEDS_REVIEW
    }
  };
}

export function prepareSeedImport(jsonInputs: string[], options: PrepareSeedImportOptions = {}) {
  const rows = jsonInputs.flatMap((input) => parseSeedDatasetJson(input));
  const limitedRows = options.limit && options.limit > 0 ? rows.slice(0, options.limit) : rows;
  const previews = limitedRows.map((row) => buildSeedCandidate(row));
  const commitReady = previews.filter((preview) => preview.candidate !== null);
  const skipped = previews.filter((preview) => preview.candidate === null);

  return {
    rows: limitedRows,
    previews,
    commitReady,
    skipped
  };
}

export async function ensureSeedImportSource(prisma: PrismaClient) {
  return prisma.source.upsert({
    where: { key: "seed-dataset-import" },
    update: {
      name: "Seed Dataset Imports",
      type: SourceType.MANUAL,
      baseUrl: "file-import://seed-dataset-json",
      attribution: "Imported from structured JSON webcam seed batches"
    },
    create: {
      key: "seed-dataset-import",
      name: "Seed Dataset Imports",
      type: SourceType.MANUAL,
      baseUrl: "file-import://seed-dataset-json",
      attribution: "Imported from structured JSON webcam seed batches"
    }
  });
}

function buildSubmissionKey(candidate: SeedImportCandidate, sourceId: string): string {
  return [
    sourceId,
    candidate.title.trim().toLowerCase(),
    candidate.sourceUrl.trim().toLowerCase(),
    candidate.latitude.toFixed(5),
    candidate.longitude.toFixed(5)
  ].join("|");
}

export async function commitSeedImport(
  prisma: PrismaClient,
  previews: SeedImportPreview[]
): Promise<CommitSeedImportResult> {
  const source = await ensureSeedImportSource(prisma);
  const candidates = previews.flatMap((preview) => (preview.candidate ? [preview.candidate] : []));

  if (candidates.length === 0) {
    return {
      inserted: 0,
      duplicatesSkipped: 0
    };
  }

  const existing = await prisma.submission.findMany({
    where: { sourceId: source.id },
    select: {
      title: true,
      sourceUrl: true,
      latitude: true,
      longitude: true
    }
  });

  const existingKeys = new Set(
    existing.map((submission) =>
      [
        source.id,
        submission.title.trim().toLowerCase(),
        submission.sourceUrl.trim().toLowerCase(),
        submission.latitude.toFixed(5),
        submission.longitude.toFixed(5)
      ].join("|")
    )
  );

  const rowsToInsert = [];
  let duplicatesSkipped = 0;

  for (const candidate of candidates) {
    const key = buildSubmissionKey(candidate, source.id);
    if (existingKeys.has(key)) {
      duplicatesSkipped += 1;
      continue;
    }

    existingKeys.add(key);
    rowsToInsert.push({
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
      status: candidate.status,
      raw: candidate.raw
    });
  }

  if (rowsToInsert.length > 0) {
    await prisma.submission.createMany({
      data: rowsToInsert
    });
  }

  return {
    inserted: rowsToInsert.length,
    duplicatesSkipped
  };
}
