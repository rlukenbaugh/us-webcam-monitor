import { AdapterContext, AdapterRunResult, NormalizedCameraRecord, SourceAdapter } from "@/lib/adapters/types";
import { getAdapterConfig } from "@/lib/adapters/config";
import { createSlug, deduplicateNormalizedRecords, fetchJsonWithRetry, inferStreamType, normalizeUrl } from "@/lib/adapters/utils";

const DEFAULT_TIMEOUT_MS = Number(process.env.ADAPTER_FETCH_TIMEOUT_MS ?? 12000);
const CONFIG = getAdapterConfig("wa-dot");

function extractArray(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload as Array<Record<string, unknown>>;
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const root = payload as Record<string, unknown>;

  const possibleArrays = [root.Cameras, root.cameras, root.Items, root.items, root.value];

  for (const item of possibleArrays) {
    if (Array.isArray(item)) {
      return item as Array<Record<string, unknown>>;
    }
  }

  return [];
}

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

export class WashingtonDotAdapter implements SourceAdapter {
  readonly key = "wa-dot";
  readonly sourceType = "dot" as const;

  async run(context: AdapterContext): Promise<AdapterRunResult> {
    const errors: string[] = [];
    const accessCode = process.env.WSDOT_ACCESS_CODE;
    const apiUrl =
      process.env.WSDOT_API_URL ??
      CONFIG?.defaultApiUrl ??
      "https://wsdot.wa.gov/Traffic/api/HighwayCameras/HighwayCamerasREST.svc/GetHighwayCamerasAsJson";

    if (!accessCode) {
      return {
        fetchedCount: 0,
        normalized: [],
        errors: ["WSDOT_ACCESS_CODE is required for Washington DOT sync"]
      };
    }

    const url = new URL(apiUrl);
    url.searchParams.set("AccessCode", accessCode);

    let payload: unknown;

    try {
      payload = await fetchJsonWithRetry(url.toString(), {
        timeoutMs: context.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        fetchImpl: context.fetchImpl
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown Washington DOT fetch error");
      return {
        fetchedCount: 0,
        normalized: [],
        errors
      };
    }

    const rawRows = extractArray(payload);
    const normalized: NormalizedCameraRecord[] = [];

    for (const row of rawRows) {
      const latitude =
        asNumber(row.DisplayLatitude) ??
        asNumber(row.Latitude) ??
        asNumber(row.latitude);
      const longitude =
        asNumber(row.DisplayLongitude) ??
        asNumber(row.Longitude) ??
        asNumber(row.longitude);
      const title = asString(row.Title) ?? asString(row.Description) ?? asString(row.Name);

      if (!title || latitude === null || longitude === null) {
        continue;
      }

      const imageUrl =
        normalizeUrl(asString(row.ImageUrl) ?? asString(row.imageUrl) ?? asString(row.ImageURL));
      const pageUrl =
        normalizeUrl(asString(row.Url) ?? asString(row.Link) ?? asString(row.PageUrl));

      const city =
        asString(row.City) ??
        asString(row.Location) ??
        asString(row.Region);

      const externalId =
        asString(row.CameraID) ?? asString(row.CameraId) ?? asString(row.ID) ?? null;

      const statusCandidate = asString(row.IsActive) ?? asString(row.Status);
      const status =
        statusCandidate && ["true", "active", "online", "1"].includes(statusCandidate.toLowerCase())
          ? "online"
          : "unknown";

      normalized.push({
        externalId,
        sourceId: context.sourceId,
        sourceType: this.sourceType,
        name: title,
        slug: createSlug(`wa-dot-${externalId ?? title}-${latitude}-${longitude}`),
        category: "traffic",
        description: asString(row.RouteName) ?? null,
        countryCode: "US",
        stateCode: CONFIG?.stateCode ?? "WA",
        city,
        latitude,
        longitude,
        streamType: inferStreamType(imageUrl),
        streamUrl: null,
        imageUrl,
        pageUrl,
        providerUrl: CONFIG?.providerUrl ?? "https://wsdot.wa.gov/",
        status,
        lastCheckedAt: null,
        lastSuccessAt: null,
        confidenceScore: status === "online" ? 0.82 : 0.58,
        tags: ["traffic", "dot", "washington"],
        raw: row
      });
    }

    return {
      fetchedCount: rawRows.length,
      normalized: deduplicateNormalizedRecords(normalized),
      errors
    };
  }
}
