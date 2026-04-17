import { inferStreamType, normalizeUrl } from "@/lib/adapters/utils";

const REQUEST_TIMEOUT_MS = Number(process.env.SUBMISSION_HEALTH_TIMEOUT_MS ?? 10000);

type SubmissionForHealthCheck = {
  sourceUrl: string;
  embedUrl: string | null;
  imageUrl: string | null;
};

export type SubmissionHealthCheckResult = {
  success: boolean;
  checkedAt: Date;
  targetUrl: string | null;
  targetKind: "stream" | "image" | "none";
  httpStatus: number | null;
  contentType: string | null;
  responseMs: number | null;
  failureReason: string | null;
};

async function fetchWithTimeout(input: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": "us-webcam-monitor/0.1",
        ...(init.headers ?? {})
      },
      cache: "no-store",
      redirect: "follow"
    });
  } finally {
    clearTimeout(timeout);
  }
}

function looksHealthyResponse(url: string, contentType: string | null) {
  const inferredType = inferStreamType(url);
  const loweredContentType = contentType?.toLowerCase() ?? "";

  switch (inferredType) {
    case "jpeg":
      return loweredContentType.startsWith("image/");
    case "mjpeg":
      return loweredContentType.includes("multipart/") || loweredContentType.startsWith("image/");
    case "hls":
      return (
        loweredContentType.includes("mpegurl") ||
        loweredContentType.includes("application/octet-stream") ||
        loweredContentType.includes("text/plain") ||
        loweredContentType.length === 0
      );
    case "iframe":
    case "youtube":
    case "unknown":
    default:
      return true;
  }
}

async function validateUrl(url: string, targetKind: "stream" | "image"): Promise<SubmissionHealthCheckResult> {
  const checkedAt = new Date();
  const startedAt = Date.now();

  try {
    const headResponse = await fetchWithTimeout(url, {
      method: "HEAD"
    });

    const contentType = headResponse.headers.get("content-type");
    const responseMs = Date.now() - startedAt;

    if (headResponse.ok && looksHealthyResponse(url, contentType)) {
      return {
        success: true,
        checkedAt,
        targetUrl: url,
        targetKind,
        httpStatus: headResponse.status,
        contentType,
        responseMs,
        failureReason: null
      };
    }

    if (![403, 405].includes(headResponse.status)) {
      return {
        success: false,
        checkedAt,
        targetUrl: url,
        targetKind,
        httpStatus: headResponse.status,
        contentType,
        responseMs,
        failureReason: `HEAD request failed with ${headResponse.status}`
      };
    }
  } catch {
    // GET fallback below handles transient HEAD issues.
  }

  const fallbackStartedAt = Date.now();

  try {
    const getResponse = await fetchWithTimeout(url, {
      method: "GET"
    });
    const contentType = getResponse.headers.get("content-type");
    const responseMs = Date.now() - fallbackStartedAt;
    const success = getResponse.ok && looksHealthyResponse(url, contentType);

    return {
      success,
      checkedAt,
      targetUrl: url,
      targetKind,
      httpStatus: getResponse.status,
      contentType,
      responseMs,
      failureReason: success ? null : `GET request failed with ${getResponse.status}`
    };
  } catch (error) {
    return {
      success: false,
      checkedAt,
      targetUrl: url,
      targetKind,
      httpStatus: null,
      contentType: null,
      responseMs: Date.now() - fallbackStartedAt,
      failureReason: error instanceof Error ? error.message : "Unknown media request failure"
    };
  }
}

export async function validateSubmissionHealth(
  submission: SubmissionForHealthCheck
): Promise<SubmissionHealthCheckResult> {
  const normalizedImageUrl = normalizeUrl(submission.imageUrl);
  const normalizedEmbedUrl = normalizeUrl(submission.embedUrl);

  if (normalizedImageUrl) {
    const result = await validateUrl(normalizedImageUrl, "image");
    if (result.success) {
      return result;
    }
  }

  if (normalizedEmbedUrl) {
    return validateUrl(normalizedEmbedUrl, "stream");
  }

  return {
    success: false,
    checkedAt: new Date(),
    targetUrl: null,
    targetKind: "none",
    httpStatus: null,
    contentType: null,
    responseMs: null,
    failureReason: "No embeddable media URL was available for health validation"
  };
}
