import { CameraCategory, Prisma, PrismaClient, SourceType, SubmissionStatus } from "@prisma/client";

export type FinderCsvRow = {
  source_page: string;
  candidate_url: string;
  ok: string;
  status_code: string;
  content_type: string;
  stream_type: string;
};

export type InferredLocation = {
  latitude: number;
  longitude: number;
  stateCode: string | null;
  city: string | null;
};

export type ImportCandidate = {
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

export type ImportPreview = {
  row: FinderCsvRow;
  candidate: ImportCandidate | null;
  skippedReason: string | null;
};

export type PrepareImportOptions = {
  limit?: number;
  fallbackLocation?: InferredLocation | null;
};

export type CommitImportResult = {
  inserted: number;
  duplicatesSkipped: number;
};

const STATE_HOST_HINTS: Record<string, InferredLocation> = {
  "dot.state.mn.us": { latitude: 46.7296, longitude: -94.6859, stateCode: "MN", city: null },
  "wsdot.wa.gov": { latitude: 47.4009, longitude: -121.4905, stateCode: "WA", city: null },
  "fl511.com": { latitude: 27.6648, longitude: -81.5158, stateCode: "FL", city: null },
  "quickmap.dot.ca.gov": { latitude: 36.7783, longitude: -119.4179, stateCode: "CA", city: null },
  "511ny.org": { latitude: 42.9134, longitude: -75.5963, stateCode: "NY", city: null },
  "maps.cotrip.org": { latitude: 39.113, longitude: -105.3589, stateCode: "CO", city: null },
  "its.txdot.gov": { latitude: 31.0545, longitude: -97.5635, stateCode: "TX", city: null },
  "traffic.houstontranstar.org": { latitude: 29.7604, longitude: -95.3698, stateCode: "TX", city: "Houston" }
};

const KEYWORD_LOCATION_HINTS: Array<{ pattern: RegExp; location: InferredLocation }> = [
  { pattern: /\byellowstone\b/i, location: { latitude: 44.428, longitude: -110.5885, stateCode: "WY", city: "Yellowstone National Park" } },
  { pattern: /\byosemite\b|\/yose\//i, location: { latitude: 37.8651, longitude: -119.5383, stateCode: "CA", city: "Yosemite Valley" } },
  { pattern: /\bgrand canyon\b|\/grca\//i, location: { latitude: 36.0544, longitude: -112.1401, stateCode: "AZ", city: "Grand Canyon National Park" } },
  { pattern: /\bglacier\b|\/glac\//i, location: { latitude: 48.7596, longitude: -113.787, stateCode: "MT", city: "Glacier National Park" } },
  { pattern: /\bzion\b/i, location: { latitude: 37.2982, longitude: -113.0263, stateCode: "UT", city: "Zion National Park" } },
  { pattern: /\bolympic\b/i, location: { latitude: 47.8021, longitude: -123.6044, stateCode: "WA", city: "Olympic National Park" } },
  { pattern: /\bdenali\b/i, location: { latitude: 63.1148, longitude: -151.1926, stateCode: "AK", city: "Denali National Park" } },
  { pattern: /\bwaikiki\b/i, location: { latitude: 21.2767, longitude: -157.8267, stateCode: "HI", city: "Waikiki" } },
  { pattern: /\bsanta-monica\b|\bsanta monica\b/i, location: { latitude: 34.0195, longitude: -118.4912, stateCode: "CA", city: "Santa Monica" } },
  { pattern: /\bmiami\b/i, location: { latitude: 25.7617, longitude: -80.1918, stateCode: "FL", city: "Miami" } },
  { pattern: /\bkey-west\b|\bkey west\b/i, location: { latitude: 24.5551, longitude: -81.78, stateCode: "FL", city: "Key West" } },
  { pattern: /\bpensacola\b/i, location: { latitude: 30.4213, longitude: -87.2169, stateCode: "FL", city: "Pensacola Beach" } },
  { pattern: /\blake-tahoe\b|\blake tahoe\b/i, location: { latitude: 39.0968, longitude: -120.0324, stateCode: "CA", city: "South Lake Tahoe" } },
  { pattern: /\baspen\b/i, location: { latitude: 39.1911, longitude: -106.8175, stateCode: "CO", city: "Aspen" } }
];

export function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

export function parseFinderCsv(input: string): FinderCsvRow[] {
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

    return row as FinderCsvRow;
  });
}

function safeUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function inferCategory(text: string): CameraCategory {
  const lowered = text.toLowerCase();

  if (/\b(beach|surf|pier|coast|ocean)\b/.test(lowered)) {
    return CameraCategory.BEACH;
  }
  if (/\b(park|wildlife|old faithful|geyser|trail)\b/.test(lowered)) {
    return CameraCategory.PARK;
  }
  if (/\b(ski|snow|lift|mountain)\b/.test(lowered)) {
    return CameraCategory.SKI;
  }
  if (/\b(weather|storm|airport|faa|aviation)\b/.test(lowered)) {
    return CameraCategory.WEATHER;
  }
  if (/\b(harbor|marina|port|ship|cruise)\b/.test(lowered)) {
    return CameraCategory.HARBOR;
  }
  if (/\b(downtown|skyline|square|city)\b/.test(lowered)) {
    return CameraCategory.DOWNTOWN;
  }
  if (/\b(town|village|main-street|main street)\b/.test(lowered)) {
    return CameraCategory.OTHER;
  }
  if (/\b(dot|traffic|camera|cctv|road|highway|interstate)\b/.test(lowered)) {
    return CameraCategory.TRAFFIC;
  }

  return CameraCategory.TOURISM;
}

function inferTitle(row: FinderCsvRow, category: CameraCategory): string {
  const candidateUrl = safeUrl(row.candidate_url);
  const pageUrl = safeUrl(row.source_page);
  const host = candidateUrl?.hostname ?? pageUrl?.hostname ?? "webcam";
  const pathToken = (candidateUrl?.pathname.split("/").filter(Boolean).pop() ?? "live-view")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();

  const categoryLabel = category.toLowerCase().replace(/^\w/, (char) => char.toUpperCase());
  const titleBase = pathToken.length > 0 ? pathToken.replace(/\b\w/g, (char) => char.toUpperCase()) : host;

  return `${titleBase} ${categoryLabel} Import`.slice(0, 120);
}

export function inferLocation(row: FinderCsvRow, fallback: InferredLocation | null): InferredLocation | null {
  const candidateUrl = safeUrl(row.candidate_url);
  const pageUrl = safeUrl(row.source_page);
  const hosts = [candidateUrl?.hostname ?? "", pageUrl?.hostname ?? ""].filter(Boolean);

  for (const host of hosts) {
    for (const [hintHost, location] of Object.entries(STATE_HOST_HINTS)) {
      if (host === hintHost || host.endsWith(`.${hintHost}`)) {
        return location;
      }
    }
  }

  const searchable = `${row.source_page} ${row.candidate_url}`;
  for (const hint of KEYWORD_LOCATION_HINTS) {
    if (hint.pattern.test(searchable)) {
      return hint.location;
    }
  }

  return fallback;
}

function toJsonValue(row: FinderCsvRow, category: CameraCategory, location: InferredLocation | null): Prisma.InputJsonValue {
  return {
    importedFrom: "webcam_finder_csv",
    row,
    inferredCategory: category,
    inferredLocation: location,
    importedAt: new Date().toISOString()
  } as Prisma.InputJsonValue;
}

export function buildCandidate(row: FinderCsvRow, fallbackLocation: InferredLocation | null): ImportPreview {
  const category = inferCategory(`${row.source_page} ${row.candidate_url}`);
  const location = inferLocation(row, fallbackLocation);
  const streamType = row.stream_type.trim().toUpperCase();

  if (!location) {
    return {
      row,
      candidate: null,
      skippedReason: "No inferred or fallback location was available"
    };
  }

  const imageUrl = streamType === "IMAGE" ? row.candidate_url : null;
  const embedUrl = streamType !== "IMAGE" ? row.candidate_url : null;
  const notes = [
    "Imported from webcam_finder CSV.",
    "Coordinates are approximate and require moderator review.",
    `Source page: ${row.source_page}`,
    `Candidate URL: ${row.candidate_url}`,
    `Candidate check ok: ${row.ok}`,
    `HTTP status: ${row.status_code || "unknown"}`,
    `Content type: ${row.content_type || "unknown"}`,
    `Stream type: ${streamType || "UNKNOWN"}`
  ].join(" ");

  return {
    row,
    skippedReason: null,
    candidate: {
      title: inferTitle(row, category),
      sourceUrl: row.source_page || row.candidate_url,
      embedUrl,
      imageUrl,
      latitude: location.latitude,
      longitude: location.longitude,
      stateCode: location.stateCode,
      city: location.city,
      category,
      notes,
      raw: toJsonValue(row, category, location),
      status: SubmissionStatus.NEEDS_REVIEW
    }
  };
}

export function prepareFinderImport(csvInput: string, options: PrepareImportOptions = {}) {
  const rows = parseFinderCsv(csvInput);
  const limitedRows = options.limit && options.limit > 0 ? rows.slice(0, options.limit) : rows;
  const previews = limitedRows.map((row) => buildCandidate(row, options.fallbackLocation ?? null));
  const commitReady = previews.filter((preview) => preview.candidate !== null);
  const skipped = previews.filter((preview) => preview.candidate === null);

  return {
    rows: limitedRows,
    previews,
    commitReady,
    skipped
  };
}

export async function ensureFinderSource(prisma: PrismaClient) {
  return prisma.source.upsert({
    where: { key: "webcam-finder-import" },
    update: {
      name: "Webcam Finder Imports",
      type: SourceType.MANUAL,
      baseUrl: "file-import://webcam-finder",
      attribution: "Imported from webcam_finder.py CSV output"
    },
    create: {
      key: "webcam-finder-import",
      name: "Webcam Finder Imports",
      type: SourceType.MANUAL,
      baseUrl: "file-import://webcam-finder",
      attribution: "Imported from webcam_finder.py CSV output"
    }
  });
}

export async function commitFinderImport(prisma: PrismaClient, previews: ImportPreview[]): Promise<CommitImportResult> {
  const source = await ensureFinderSource(prisma);
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
        status: candidate.status,
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
