import slugify from "slugify";
import { NormalizedCameraRecord, StreamTypeNormalized } from "@/lib/adapters/types";

const URL_CLEAN_PATTERN = /\/$/;

function isCameraSpecificPageUrl(url: string | null): boolean {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, "");

    if (parsed.search.length > 0 || parsed.hash.length > 0) {
      return true;
    }

    return path.length > 1;
  } catch {
    return false;
  }
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function createSlug(input: string): string {
  return slugify(input, {
    lower: true,
    strict: true,
    trim: true
  });
}

export function normalizeUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value.trim());
    return url.toString().replace(URL_CLEAN_PATTERN, "");
  } catch {
    return null;
  }
}

export function inferStreamType(url: string | null): StreamTypeNormalized {
  if (!url) {
    return "unknown";
  }

  const lowered = url.toLowerCase();

  if (lowered.includes("youtube.com") || lowered.includes("youtu.be")) {
    return "youtube";
  }
  if (
    lowered.includes("m3u8") ||
    lowered.includes("/live/playlist") ||
    lowered.includes("/live/stream")
  ) {
    return "hls";
  }
  if (
    lowered.includes("mjpg") ||
    lowered.includes("mjpeg") ||
    lowered.includes("axis-cgi/mjpg/video.cgi") ||
    lowered.includes("cgi-bin/mjpg/video.cgi") ||
    lowered.includes("video.cgi")
  ) {
    return "mjpeg";
  }
  if (
    lowered.endsWith(".jpg") ||
    lowered.endsWith(".jpeg") ||
    lowered.endsWith(".png") ||
    lowered.includes("snapshot.jpg") ||
    lowered.includes("current.jpg") ||
    lowered.includes("live.jpg") ||
    lowered.includes("webcam.jpg") ||
    lowered.includes("image.jpg")
  ) {
    return "jpeg";
  }
  if (
    lowered.includes("embed") ||
    lowered.includes("iframe") ||
    lowered.includes("/camera/") ||
    lowered.includes("/webcam/") ||
    lowered.includes("/livecam/")
  ) {
    return "iframe";
  }

  return "unknown";
}

export async function fetchJsonWithTimeout(
  input: string,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
  init?: RequestInit
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(input, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": "us-webcam-monitor/0.1",
        ...(init?.headers ?? {})
      },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Request failed (${response.status}) for ${input}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchJsonWithRetry(
  input: string,
  options: {
    timeoutMs: number;
    fetchImpl?: typeof fetch;
    init?: RequestInit;
    retries?: number;
    retryDelayMs?: number;
    backoffMultiplier?: number;
  }
): Promise<unknown> {
  const retries = options.retries ?? 2;
  const retryDelayMs = options.retryDelayMs ?? 800;
  const backoffMultiplier = options.backoffMultiplier ?? 2;
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= retries) {
    try {
      return await fetchJsonWithTimeout(
        input,
        options.timeoutMs,
        options.fetchImpl ?? fetch,
        options.init
      );
    } catch (error) {
      lastError = error;
      if (attempt >= retries) {
        break;
      }
      const delayMs = Math.round(retryDelayMs * backoffMultiplier ** attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      attempt += 1;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Request failed for ${input}`);
}

function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const lat1 = toRadians(aLat);
  const lat2 = toRadians(bLat);

  const arc =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * earthRadiusMiles * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function namesAreSimilar(a: string, b: string): boolean {
  const aNorm = normalizeName(a);
  const bNorm = normalizeName(b);

  if (!aNorm || !bNorm) {
    return false;
  }

  if (aNorm === bNorm) {
    return true;
  }

  return aNorm.includes(bNorm) || bNorm.includes(aNorm);
}

export function deduplicateNormalizedRecords(records: NormalizedCameraRecord[]): NormalizedCameraRecord[] {
  const deduped: NormalizedCameraRecord[] = [];

  for (const record of records) {
    const normalizedStream = normalizeUrl(record.streamUrl);
    const normalizedImage = normalizeUrl(record.imageUrl);
    const normalizedPage = normalizeUrl(record.pageUrl);

    const duplicate = deduped.find((candidate) => {
      const sameMediaUrl =
        (normalizedStream && normalizeUrl(candidate.streamUrl) === normalizedStream) ||
        (normalizedImage && normalizeUrl(candidate.imageUrl) === normalizedImage);

      const sameCameraPage =
        isCameraSpecificPageUrl(normalizedPage) &&
        normalizeUrl(candidate.pageUrl) === normalizedPage;

      const closeCoordinates =
        haversineMiles(
          candidate.latitude,
          candidate.longitude,
          record.latitude,
          record.longitude
        ) <= 0.1;

      return Boolean(sameMediaUrl || sameCameraPage || (closeCoordinates && namesAreSimilar(candidate.name, record.name)));
    });

    if (!duplicate) {
      deduped.push(record);
    }
  }

  return deduped;
}
