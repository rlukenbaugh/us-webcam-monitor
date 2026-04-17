import { AdapterContext, AdapterRunResult, NormalizedCameraRecord, SourceAdapter } from "@/lib/adapters/types";
import { getAdapterConfig } from "@/lib/adapters/config";
import { createSlug, deduplicateNormalizedRecords, fetchJsonWithRetry, inferStreamType, normalizeUrl } from "@/lib/adapters/utils";

const DEFAULT_TIMEOUT_MS = Number(process.env.ADAPTER_FETCH_TIMEOUT_MS ?? 12000);
const CONFIG = getAdapterConfig("ohgo-dot");
const DEFAULT_PROVIDER_URL = CONFIG?.providerUrl ?? "https://www.ohgo.com/";

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
  return null;
}

function extractRows(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload as Array<Record<string, unknown>>;
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const root = payload as Record<string, unknown>;
  const candidates = [root.results, root.cameras, root.Cameras, root.data, root.items, root.value];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate as Array<Record<string, unknown>>;
    }
  }

  if (root.data && typeof root.data === "object" && Array.isArray((root.data as Record<string, unknown>).cameras)) {
    return (root.data as Record<string, unknown>).cameras as Array<Record<string, unknown>>;
  }

  return [];
}

function extractNextPageUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const links = (payload as Record<string, unknown>).links;
  if (!Array.isArray(links)) {
    return null;
  }

  for (const link of links) {
    if (!link || typeof link !== "object" || Array.isArray(link)) {
      continue;
    }

    const href = asString((link as Record<string, unknown>).href);
    const rel = asString((link as Record<string, unknown>).rel)?.toLowerCase();

    if (href && rel === "next-page") {
      return href;
    }
  }

  return null;
}

export class OhioOhgoAdapter implements SourceAdapter {
  readonly key = "ohgo-dot";
  readonly sourceType = "dot" as const;

  async run(context: AdapterContext): Promise<AdapterRunResult> {
    const errors: string[] = [];
    const ohgoApiKey = process.env.OHGO_API_KEY?.trim();
    const apiUrl = process.env.OHGO_API_URL ?? CONFIG?.defaultApiUrl ?? "https://publicapi.ohgo.com/api/v1/cameras";

    if (!ohgoApiKey) {
      errors.push("OHGO_API_KEY is required for Ohio OHGO sync");
      return {
        fetchedCount: 0,
        normalized: [],
        errors
      };
    }

    let payload: unknown;
    let rows: Array<Record<string, unknown>> = [];

    try {
      let nextPageUrl: string | null = apiUrl;

      while (nextPageUrl) {
        payload = await fetchJsonWithRetry(nextPageUrl, {
          timeoutMs: context.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          fetchImpl: context.fetchImpl,
          init: {
            headers: {
              Authorization: `APIKEY ${ohgoApiKey}`,
              Accept: "application/json"
            }
          }
        });

        rows.push(...extractRows(payload));
        nextPageUrl = extractNextPageUrl(payload);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown OHGO fetch error");
      return {
        fetchedCount: 0,
        normalized: [],
        errors
      };
    }

    const normalized: NormalizedCameraRecord[] = [];

    for (const row of rows) {
      const latitude =
        asNumber(row.latitude) ?? asNumber(row.Latitude) ?? asNumber(row.lat);
      const longitude =
        asNumber(row.longitude) ?? asNumber(row.Longitude) ?? asNumber(row.lon) ?? asNumber(row.lng);
      const name =
        asString(row.name) ?? asString(row.Name) ?? asString(row.description) ?? asString(row.title);

      if (!name || latitude === null || longitude === null) {
        continue;
      }

      const pageUrl = normalizeUrl(asString(row.url) ?? asString(row.pageUrl) ?? asString(row.link));
      const cameraViews = Array.isArray(row.cameraViews)
        ? (row.cameraViews as Array<Record<string, unknown>>)
        : [];
      const primaryView = cameraViews[0] ?? null;
      const streamCandidate = normalizeUrl(
        asString(row.streamUrl) ??
          asString(row.videoUrl) ??
          asString(row.embedUrl) ??
          asString(primaryView?.streamUrl)
      );
      const imageCandidate = normalizeUrl(
        asString(row.imageUrl) ??
          asString(row.thumbnailUrl) ??
          asString(row.snapshotUrl) ??
          asString(primaryView?.largeUrl) ??
          asString(primaryView?.smallUrl)
      );
      const inferredType = inferStreamType(streamCandidate ?? imageCandidate);
      const externalId = asString(row.id) ?? asString(row.cameraId) ?? asString(row.externalId);

      const statusValue =
        asString(row.status) ?? asString(row.state) ?? asString(row.isActive);
      const onlineStates = ["online", "active", "true", "up", "available", "1"];
      const offlineStates = ["offline", "inactive", "false", "down", "0"];

      let status: "online" | "offline" | "unknown" = "unknown";
      if (statusValue) {
        const lowered = statusValue.toLowerCase();
        if (onlineStates.includes(lowered)) {
          status = "online";
        } else if (offlineStates.includes(lowered)) {
          status = "offline";
        }
      }

      normalized.push({
        externalId,
        sourceId: context.sourceId,
        sourceType: this.sourceType,
        name,
        slug: createSlug(`ohgo-${externalId ?? name}-${latitude}-${longitude}`),
        category: "traffic",
        description:
          asString(row.description) ??
          asString(primaryView?.mainRoute) ??
          asString(row.direction) ??
          null,
        countryCode: "US",
        stateCode: CONFIG?.stateCode ?? "OH",
        city: asString(row.city) ?? asString(row.county) ?? null,
        latitude,
        longitude,
        streamType: inferredType,
        streamUrl: inferredType === "jpeg" ? null : streamCandidate,
        imageUrl: imageCandidate,
        pageUrl: pageUrl ?? normalizeUrl(`https://publicapi.ohgo.com/api/v1/cameras/${externalId ?? ""}`),
        providerUrl: DEFAULT_PROVIDER_URL,
        status,
        lastCheckedAt: null,
        lastSuccessAt: null,
        confidenceScore: status === "online" ? 0.86 : status === "offline" ? 0.2 : 0.55,
        tags: ["traffic", "dot", "ohio"],
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
