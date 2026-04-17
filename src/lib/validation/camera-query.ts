import { CameraCategory, SourceType, StreamType } from "@prisma/client";
import { z } from "zod";

const US_BBOX: [number, number, number, number] = [-125, 24, -66, 49.5];
const GLOBAL_BBOX: [number, number, number, number] = [-180, -85, 180, 85];

function parseBooleanValue(value: string | null | undefined, fallback = false): boolean {
  if (value === undefined || value === null || value.length === 0) {
    return fallback;
  }

  const normalized = value.toLowerCase().trim();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

const querySchema = z.object({
  scope: z.enum(["us", "global"]).default("us"),
  bbox: z.string().optional(),
  zoom: z.coerce.number().min(0).max(24).default(4),
  q: z.string().optional().transform((value) => value?.trim() ?? ""),
  categories: z.string().optional(),
  sourceTypes: z.string().optional(),
  streamTypes: z.string().optional(),
  state: z
    .string()
    .optional()
    .transform((value) => value?.trim().toUpperCase() || undefined),
  working: z.coerce.boolean().default(false),
  liveOnly: z.coerce.boolean().default(false),
  snapshotOnly: z.coerce.boolean().default(false),
  stormView: z.coerce.boolean().default(false),
  limit: z.coerce.number().min(50).max(5000).default(2500)
});

function parseEnumList<T extends string>(
  raw: string | undefined,
  allowed: ReadonlyArray<T>
): T[] {
  if (!raw) {
    return [];
  }

  const values = raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => item.toUpperCase());

  return values.filter((value): value is T => allowed.includes(value as T));
}

export type ParsedCameraQuery = {
  scope: "us" | "global";
  bbox: [number, number, number, number];
  zoom: number;
  q: string;
  categories: CameraCategory[];
  sourceTypes: SourceType[];
  streamTypes: StreamType[];
  state: string | undefined;
  working: boolean;
  liveOnly: boolean;
  snapshotOnly: boolean;
  stormView: boolean;
  limit: number;
};

export function parseCameraQuery(searchParams: URLSearchParams): ParsedCameraQuery {
  const parsed = querySchema.parse({
    scope: searchParams.get("scope") ?? "us",
    bbox: searchParams.get("bbox") ?? undefined,
    zoom: searchParams.get("zoom") ?? undefined,
    q: searchParams.get("q") ?? undefined,
    categories: searchParams.get("categories") ?? undefined,
    sourceTypes: searchParams.get("sourceTypes") ?? undefined,
    streamTypes: searchParams.get("streamTypes") ?? undefined,
    state: searchParams.get("state") ?? undefined,
    working: parseBooleanValue(searchParams.get("working"), false),
    liveOnly: parseBooleanValue(searchParams.get("liveOnly"), false),
    snapshotOnly: parseBooleanValue(searchParams.get("snapshotOnly"), false),
    stormView: parseBooleanValue(searchParams.get("stormView"), false),
    limit: searchParams.get("limit") ?? undefined
  });

  const fallbackBbox = parsed.scope === "global" ? GLOBAL_BBOX : US_BBOX;
  const bboxParts = (parsed.bbox ?? "")
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part));
  const bbox =
    bboxParts.length === 4 &&
    bboxParts[0] < bboxParts[2] &&
    bboxParts[1] < bboxParts[3]
      ? ([bboxParts[0], bboxParts[1], bboxParts[2], bboxParts[3]] as [
          number,
          number,
          number,
          number
        ])
      : fallbackBbox;

  return {
    scope: parsed.scope,
    bbox,
    zoom: parsed.zoom,
    q: parsed.q,
    categories: parseEnumList(parsed.categories, Object.values(CameraCategory)),
    sourceTypes: parseEnumList(parsed.sourceTypes, Object.values(SourceType)),
    streamTypes: parseEnumList(parsed.streamTypes, Object.values(StreamType)),
    state: parsed.state,
    working: parsed.working,
    liveOnly: parsed.liveOnly,
    snapshotOnly: parsed.snapshotOnly,
    stormView: parsed.stormView,
    limit: parsed.limit
  };
}
