import { CameraCategory, Prisma, PrismaClient, SourceType, SubmissionStatus } from "@prisma/client";
import { createSlug, inferStreamType, normalizeUrl } from "@/lib/adapters/utils";

export type ValidatorHealthRow = {
  ok: boolean | null;
  status_code: number | null;
  content_type: string | null;
  checked_at: string | null;
  response_ms: number | null;
};

export type ValidatorJsonRow = {
  id: string;
  camera_name: string;
  latitude: number;
  longitude: number;
  country: string;
  state_or_region: string | null;
  city: string | null;
  category: string;
  stream_url: string | null;
  stream_type: string | null;
  image_url: string | null;
  source_website: string | null;
  status: string | null;
  validator: ValidatorHealthRow | null;
};

export type ValidatorImportCandidate = {
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

export type ValidatorImportPreview = {
  row: ValidatorJsonRow;
  candidate: ValidatorImportCandidate | null;
  skippedReason: string | null;
};

export type PrepareValidatorImportOptions = {
  limit?: number;
};

export type CommitValidatorImportResult = {
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

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  return null;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "n"].includes(normalized)) {
      return false;
    }
  }

  return null;
}

function normalizeStateCode(country: string, stateOrRegion: string | null): string | null {
  if (!stateOrRegion) {
    return null;
  }

  if (!/^united states$/i.test(country) && !/^us$/i.test(country)) {
    return null;
  }

  const trimmed = stateOrRegion.trim();
  if (/^[A-Z]{2}$/.test(trimmed)) {
    return trimmed;
  }

  return US_STATE_CODE_BY_NAME[trimmed.toLowerCase()] ?? null;
}

function mapCategory(category: string): CameraCategory {
  const lowered = category.trim().toLowerCase();

  switch (lowered) {
    case "traffic":
      return CameraCategory.TRAFFIC;
    case "weather":
      return CameraCategory.WEATHER;
    case "aviation":
    case "airport":
      return CameraCategory.AVIATION;
    case "beach":
      return CameraCategory.BEACH;
    case "tourism":
      return CameraCategory.TOURISM;
    case "city":
    case "downtown":
      return CameraCategory.DOWNTOWN;
    case "mountain":
      return CameraCategory.MOUNTAIN;
    case "park":
      return CameraCategory.PARK;
    case "harbor":
      return CameraCategory.HARBOR;
    case "ski":
      return CameraCategory.SKI;
    default:
      return CameraCategory.OTHER;
  }
}

function isFiniteCoordinate(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

function extractRows(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) {
    return parsed.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  }

  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    const nested = ["items", "webcams", "records", "data"]
      .map((key) => record[key])
      .find((value) => Array.isArray(value));

    if (Array.isArray(nested)) {
      return nested.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
    }

    return [record];
  }

  throw new Error("Validator JSON must be a webcam object, an array of webcam objects, or an object with an items/webcams/records/data array");
}

export function parseValidatorJson(input: string): ValidatorJsonRow[] {
  const parsed = JSON.parse(input) as unknown;
  const rows = extractRows(parsed);

  return rows.map((row, index) => {
    const validatorPayload =
      row.validator && typeof row.validator === "object"
        ? (row.validator as Record<string, unknown>)
        : row;

    return {
      id: asString(row.id) ?? `validator-row-${index + 1}`,
      camera_name: asString(row.camera_name) ?? asString(row.name) ?? asString(row.title) ?? "",
      latitude: asNumber(row.latitude) ?? asNumber(row.lat) ?? Number.NaN,
      longitude: asNumber(row.longitude) ?? asNumber(row.lng) ?? asNumber(row.lon) ?? Number.NaN,
      country: asString(row.country) ?? "United States",
      state_or_region:
        asString(row.state_or_region) ??
        asString(row.stateCode) ??
        asString(row.state) ??
        asString(row.region),
      city: asString(row.city),
      category: asString(row.category) ?? "other",
      stream_url:
        asString(row.stream_url) ??
        asString(row.streamUrl) ??
        asString(row.embed_url) ??
        asString(row.embedUrl) ??
        asString(row.candidate_url),
      stream_type: asString(row.stream_type) ?? asString(row.streamType),
      image_url: asString(row.image_url) ?? asString(row.imageUrl),
      source_website:
        asString(row.source_website) ??
        asString(row.sourceUrl) ??
        asString(row.source_url) ??
        asString(row.page_url) ??
        asString(row.pageUrl) ??
        asString(row.source_page),
      status: asString(row.status),
      validator: {
        ok: asBoolean(validatorPayload.ok),
        status_code: asNumber(validatorPayload.status_code),
        content_type: asString(validatorPayload.content_type),
        checked_at: asString(validatorPayload.checked_at),
        response_ms: asNumber(validatorPayload.response_ms)
      }
    };
  });
}

function buildNotes(row: ValidatorJsonRow): string {
  const validatorSummary = row.validator
    ? [
        `Validator ok: ${row.validator.ok === null ? "unknown" : row.validator.ok ? "true" : "false"}`,
        `status: ${row.validator.status_code ?? "unknown"}`,
        `content type: ${row.validator.content_type ?? "unknown"}`,
        `checked at: ${row.validator.checked_at ?? "unknown"}`,
        `response: ${row.validator.response_ms ?? "unknown"} ms`
      ].join("; ")
    : "Validator result not provided.";

  return [
    "Imported from validator-aware JSON upload.",
    `Validator id: ${row.id}`,
    `Source website: ${row.source_website ?? "unknown"}`,
    `Stream type: ${row.stream_type ?? "unknown"}`,
    `Seeded status: ${row.status ?? "unknown"}`,
    validatorSummary
  ].join(" ");
}

function buildRaw(row: ValidatorJsonRow): Prisma.InputJsonValue {
  return {
    importedFrom: "validator_json",
    validatorImport: row,
    importedAt: new Date().toISOString()
  } as Prisma.InputJsonValue;
}

export function buildValidatorCandidate(row: ValidatorJsonRow): ValidatorImportPreview {
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

  const normalizedStreamUrl = normalizeUrl(row.stream_url);
  const normalizedImageUrl = normalizeUrl(row.image_url);
  const normalizedSourceUrl =
    normalizeUrl(row.source_website) ??
    normalizedStreamUrl ??
    normalizedImageUrl;

  if (!normalizedSourceUrl) {
    return {
      row,
      candidate: null,
      skippedReason: "Missing source or media URL"
    };
  }

  const inferredType =
    row.stream_type?.trim().toLowerCase() ||
    inferStreamType(normalizedImageUrl ?? normalizedStreamUrl);
  const validatorContentType = row.validator?.content_type?.toLowerCase() ?? "";
  const looksLikeImage =
    inferredType === "jpeg" ||
    validatorContentType.startsWith("image/") ||
    (normalizedImageUrl !== null && !normalizedStreamUrl);

  const imageUrl = normalizeUrl(normalizedImageUrl ?? (looksLikeImage ? normalizedStreamUrl : null));
  const embedUrl = looksLikeImage ? null : normalizedStreamUrl;
  const stateCode = normalizeStateCode(row.country, row.state_or_region);
  const slugBase = createSlug(`${row.camera_name}-${stateCode ?? row.city ?? row.id}`);

  return {
    row,
    skippedReason: null,
    candidate: {
      title: row.camera_name.trim().slice(0, 120),
      sourceUrl: normalizedSourceUrl,
      embedUrl,
      imageUrl,
      latitude: row.latitude,
      longitude: row.longitude,
      stateCode,
      city: row.city?.trim() ?? null,
      category: mapCategory(row.category),
      notes: buildNotes(row),
      raw: {
        ...(buildRaw(row) as Record<string, unknown>),
        suggestedSlug: slugBase
      } as Prisma.InputJsonValue,
      status: SubmissionStatus.NEEDS_REVIEW
    }
  };
}

export function prepareValidatorImport(jsonInputs: string[], options: PrepareValidatorImportOptions = {}) {
  const rows = jsonInputs.flatMap((input) => parseValidatorJson(input));
  const limitedRows = options.limit && options.limit > 0 ? rows.slice(0, options.limit) : rows;
  const previews = limitedRows.map((row) => buildValidatorCandidate(row));
  const commitReady = previews.filter((preview) => preview.candidate !== null);
  const skipped = previews.filter((preview) => preview.candidate === null);

  return {
    rows: limitedRows,
    previews,
    commitReady,
    skipped
  };
}

export async function ensureValidatorImportSource(prisma: PrismaClient) {
  return prisma.source.upsert({
    where: { key: "validator-json-import" },
    update: {
      name: "Validator JSON Imports",
      type: SourceType.MANUAL,
      baseUrl: "file-import://validator-json",
      attribution: "Imported from validator-aware JSON webcam files"
    },
    create: {
      key: "validator-json-import",
      name: "Validator JSON Imports",
      type: SourceType.MANUAL,
      baseUrl: "file-import://validator-json",
      attribution: "Imported from validator-aware JSON webcam files"
    }
  });
}

function buildSubmissionKey(candidate: ValidatorImportCandidate, sourceId: string): string {
  return [
    sourceId,
    candidate.title.trim().toLowerCase(),
    candidate.sourceUrl.trim().toLowerCase(),
    candidate.latitude.toFixed(5),
    candidate.longitude.toFixed(5)
  ].join("|");
}

export async function commitValidatorImport(
  prisma: PrismaClient,
  previews: ValidatorImportPreview[]
): Promise<CommitValidatorImportResult> {
  const source = await ensureValidatorImportSource(prisma);
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
