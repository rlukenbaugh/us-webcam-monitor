import { AdapterContext, AdapterRunResult, NormalizedCameraRecord, SourceAdapter } from "@/lib/adapters/types";
import { getAdapterConfig } from "@/lib/adapters/config";
import {
  createSlug,
  deduplicateNormalizedRecords,
  fetchJsonWithRetry,
  inferStreamType,
  normalizeUrl
} from "@/lib/adapters/utils";

const DEFAULT_TIMEOUT_MS = Number(process.env.ADAPTER_FETCH_TIMEOUT_MS ?? 12000);
const CONFIG = getAdapterConfig("mndot-511");

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function cleanCityReference(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return value.replace(/^(in|near)\s+/i, "").trim() || null;
}

function extractRows(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload as Array<Record<string, unknown>>;
  }

  return [];
}

export class Minnesota511Adapter implements SourceAdapter {
  readonly key = "mndot-511";
  readonly sourceType = "dot" as const;

  async run(context: AdapterContext): Promise<AdapterRunResult> {
    const errors: string[] = [];
    const apiUrl =
      process.env.MNDOT_511_API_URL ??
      CONFIG?.defaultApiUrl ??
      "https://mntg.carsprogram.org/cameras_v1/api/cameras";
    let payload: unknown;

    try {
      payload = await fetchJsonWithRetry(apiUrl, {
        timeoutMs: context.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        fetchImpl: context.fetchImpl
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown Minnesota 511 fetch error");
      return {
        fetchedCount: 0,
        normalized: [],
        errors
      };
    }

    const rows = extractRows(payload);
    const normalized: NormalizedCameraRecord[] = [];

    for (const row of rows) {
      const location =
        row.location && typeof row.location === "object" && !Array.isArray(row.location)
          ? (row.location as Record<string, unknown>)
          : null;

      const latitude = asNumber(location?.latitude);
      const longitude = asNumber(location?.longitude);
      const name = asString(row.name);
      const externalId = asString(row.id);

      if (!name || latitude === null || longitude === null) {
        continue;
      }

      const views = Array.isArray(row.views)
        ? (row.views as Array<Record<string, unknown>>)
        : [];
      const primaryView = views[0] ?? null;

      const streamUrl = normalizeUrl(asString(primaryView?.url));
      const imageUrl = normalizeUrl(asString(primaryView?.videoPreviewUrl));
      const streamType = inferStreamType(streamUrl ?? imageUrl);
      const city = cleanCityReference(asString(location?.cityReference));
      const routeId = asString(location?.routeId);
      const owner =
        row.cameraOwner && typeof row.cameraOwner === "object" && !Array.isArray(row.cameraOwner)
          ? asString((row.cameraOwner as Record<string, unknown>).name)
          : null;

      normalized.push({
        externalId,
        sourceId: context.sourceId,
        sourceType: this.sourceType,
        name,
        slug: createSlug(`mn-511-${externalId ?? name}-${latitude}-${longitude}`),
        category: "traffic",
        description: [routeId, owner].filter(Boolean).join(" - ") || null,
        countryCode: "US",
        stateCode: CONFIG?.stateCode ?? "MN",
        city,
        latitude,
        longitude,
        streamType,
        streamUrl: streamType === "jpeg" ? null : streamUrl,
        imageUrl,
        pageUrl: normalizeUrl(`https://511mn.org/camera/${externalId ?? ""}`),
        providerUrl: CONFIG?.providerUrl ?? "https://511mn.org/",
        status: row.public === true ? "online" : "unknown",
        lastCheckedAt: null,
        lastSuccessAt: null,
        confidenceScore: row.public === true ? 0.9 : 0.62,
        tags: ["traffic", "dot", "minnesota"],
        raw: row
      });
    }

    return {
      fetchedCount: rows.length,
      normalized: deduplicateNormalizedRecords(normalized),
      errors
    };
  }
}
