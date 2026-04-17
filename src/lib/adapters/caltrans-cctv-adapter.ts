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
const CONFIG = getAdapterConfig("caltrans-quickmap");

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

function buildDistrictUrl(district: string, baseUrl: string) {
  const normalizedDistrict = String(Number(district));
  const paddedDistrict = normalizedDistrict.padStart(2, "0");
  return `${baseUrl}/d${normalizedDistrict}/cctv/cctvStatusD${paddedDistrict}.json`;
}

function extractRows(payload: unknown): Array<Record<string, unknown>> {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const data = (payload as Record<string, unknown>).data;
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map((row) => {
      if (row && typeof row === "object" && !Array.isArray(row) && "cctv" in row) {
        const cctv = (row as Record<string, unknown>).cctv;
        if (cctv && typeof cctv === "object" && !Array.isArray(cctv)) {
          return cctv as Record<string, unknown>;
        }
      }

      return null;
    })
    .filter((row): row is Record<string, unknown> => row !== null);
}

export class CaltransCctvAdapter implements SourceAdapter {
  readonly key = "caltrans-quickmap";
  readonly sourceType = "dot" as const;

  async run(context: AdapterContext): Promise<AdapterRunResult> {
    const errors: string[] = [];
    const normalized: NormalizedCameraRecord[] = [];
    let fetchedCount = 0;
    const baseUrl =
      process.env.CALTRANS_CCTV_BASE_URL ?? CONFIG?.defaultApiUrl ?? "https://cwwp2.dot.ca.gov/data";
    const districts = (process.env.CALTRANS_CCTV_DISTRICTS ?? "1,2,3,4,5,6,7,8,9,10,11,12")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    for (const district of districts) {
      try {
        const payload = await fetchJsonWithRetry(buildDistrictUrl(district, baseUrl), {
          timeoutMs: context.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          fetchImpl: context.fetchImpl
        });

        const rows = extractRows(payload);
        fetchedCount += rows.length;

        for (const row of rows) {
          const location =
            row.location && typeof row.location === "object" && !Array.isArray(row.location)
              ? (row.location as Record<string, unknown>)
              : null;
          const imageData =
            row.imageData && typeof row.imageData === "object" && !Array.isArray(row.imageData)
              ? (row.imageData as Record<string, unknown>)
              : null;
          const staticImages =
            imageData?.static && typeof imageData.static === "object" && !Array.isArray(imageData.static)
              ? (imageData.static as Record<string, unknown>)
              : null;

          const latitude = asNumber(location?.latitude);
          const longitude = asNumber(location?.longitude);
          const locationName = asString(location?.locationName);

          if (!locationName || latitude === null || longitude === null) {
            continue;
          }

          const externalId = [asString(location?.district), asString(row.index), locationName]
            .filter(Boolean)
            .join("-");
          const streamUrl = normalizeUrl(asString(imageData?.streamingVideoURL));
          const imageUrl = normalizeUrl(asString(staticImages?.currentImageURL));
          const streamType = inferStreamType(streamUrl ?? imageUrl);
          const inService = asString(row.inService)?.toLowerCase() === "true";

          normalized.push({
            externalId: externalId || null,
            sourceId: context.sourceId,
            sourceType: this.sourceType,
            name: locationName,
            slug: createSlug(`caltrans-${externalId || locationName}-${latitude}-${longitude}`),
            category: "traffic",
            description: [asString(location?.route), asString(location?.direction)]
              .filter(Boolean)
              .join(" - ") || null,
            countryCode: "US",
            stateCode: CONFIG?.stateCode ?? "CA",
            city: asString(location?.nearbyPlace) ?? asString(location?.county),
            latitude,
            longitude,
            streamType,
            streamUrl: streamType === "jpeg" ? null : streamUrl,
            imageUrl,
            pageUrl: normalizeUrl("https://quickmap.dot.ca.gov/"),
            providerUrl: CONFIG?.providerUrl ?? "https://quickmap.dot.ca.gov/",
            status: inService ? "online" : "offline",
            lastCheckedAt: null,
            lastSuccessAt: null,
            confidenceScore: inService ? 0.9 : 0.3,
            tags: ["traffic", "dot", "california", `district-${district}`],
            raw: row
          });
        }
      } catch (error) {
        errors.push(
          `District ${district}: ${error instanceof Error ? error.message : "Unknown Caltrans fetch error"}`
        );
      }
    }

    return {
      fetchedCount,
      normalized: deduplicateNormalizedRecords(normalized),
      errors
    };
  }
}
