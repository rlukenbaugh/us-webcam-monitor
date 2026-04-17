import {
  AuditActorType,
  CameraCategory,
  CameraStatus,
  Prisma,
  PrismaClient,
  SourceType,
  StreamType,
  SubmissionStatus
} from "@prisma/client";
import slugify from "slugify";
import { inferStreamType, normalizeUrl } from "@/lib/adapters/utils";
import {
  SubmissionHealthCheckResult,
  validateSubmissionHealth
} from "@/lib/admin/submission-health";

function toStreamType(value: ReturnType<typeof inferStreamType>): StreamType {
  switch (value) {
    case "hls":
      return StreamType.HLS;
    case "mjpeg":
      return StreamType.MJPEG;
    case "jpeg":
      return StreamType.JPEG;
    case "iframe":
      return StreamType.IFRAME;
    case "youtube":
      return StreamType.YOUTUBE;
    default:
      return StreamType.UNKNOWN;
  }
}

function buildCameraSlug(input: string) {
  return slugify(input, {
    lower: true,
    strict: true,
    trim: true
  });
}

async function ensureUniqueSlug(prisma: PrismaClient, baseSlug: string): Promise<string> {
  let candidate = baseSlug;
  let suffix = 2;

  while (await prisma.camera.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function extractProviderUrl(sourceUrl: string): string | null {
  try {
    return new URL(sourceUrl).origin;
  } catch {
    return null;
  }
}

function isCameraSpecificSourceUrl(sourceUrl: string | null): boolean {
  if (!sourceUrl) {
    return false;
  }

  try {
    const url = new URL(sourceUrl);
    const path = url.pathname.replace(/\/+$/, "");

    if (url.search.length > 0 || url.hash.length > 0) {
      return true;
    }

    // Bare provider homepages like https://www.earthcam.com/ are too coarse for duplicate detection.
    return path.length > 1;
  } catch {
    return false;
  }
}

function toJsonValue(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function resolveCountryCode(raw: Prisma.JsonValue | null | undefined): string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return "US";
  }

  const candidate = (raw as Record<string, unknown>).countryCode;
  if (typeof candidate === "string" && /^[A-Z]{2}$/i.test(candidate.trim())) {
    return candidate.trim().toUpperCase();
  }

  return "US";
}

function approximateCoordinateMatch(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.01;
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

async function findPotentialDuplicate(prisma: PrismaClient, submission: {
  title: string;
  sourceUrl: string;
  embedUrl: string | null;
  imageUrl: string | null;
  latitude: number;
  longitude: number;
}) {
  const normalizedSourceUrl = normalizeUrl(submission.sourceUrl);
  const normalizedEmbedUrl = normalizeUrl(submission.embedUrl);
  const normalizedImageUrl = normalizeUrl(submission.imageUrl);

  const sourceMatchCandidates = normalizedSourceUrl && isCameraSpecificSourceUrl(normalizedSourceUrl)
    ? await prisma.camera.findMany({
        where: {
          pageUrl: normalizedSourceUrl
        },
        select: { id: true, slug: true, name: true, latitude: true, longitude: true }
      })
    : [];

  const sourceMatch =
    sourceMatchCandidates.find((candidate) => {
      const closeCoordinates =
        approximateCoordinateMatch(candidate.latitude, submission.latitude) &&
        approximateCoordinateMatch(candidate.longitude, submission.longitude);

      return closeCoordinates || namesAreSimilar(candidate.name, submission.title);
    }) ?? null;

  if (sourceMatch) {
    return sourceMatch;
  }

  if (normalizedEmbedUrl) {
    const streamMatch = await prisma.cameraStream.findFirst({
      where: { url: normalizedEmbedUrl },
      select: {
        camera: {
          select: { id: true, slug: true, name: true }
        }
      }
    });
    if (streamMatch?.camera) {
      return streamMatch.camera;
    }
  }

  if (normalizedImageUrl) {
    const imageMatch = await prisma.cameraImage.findFirst({
      where: { url: normalizedImageUrl },
      select: {
        camera: {
          select: { id: true, slug: true, name: true }
        }
      }
    });
    if (imageMatch?.camera) {
      return imageMatch.camera;
    }
  }

  const nearbyMatch = await prisma.camera.findMany({
    where: {
      latitude: {
        gte: submission.latitude - 0.01,
        lte: submission.latitude + 0.01
      },
      longitude: {
        gte: submission.longitude - 0.01,
        lte: submission.longitude + 0.01
      }
    },
    select: { id: true, slug: true, name: true, latitude: true, longitude: true }
  });

  const normalizedTitle = submission.title.trim().toLowerCase();
  return (
    nearbyMatch.find((camera) => {
      return (
        approximateCoordinateMatch(camera.latitude, submission.latitude) &&
        approximateCoordinateMatch(camera.longitude, submission.longitude) &&
        camera.name.trim().toLowerCase() === normalizedTitle
      );
    }) ?? null
  );
}

async function ensureManualSource(prisma: PrismaClient) {
  return prisma.source.upsert({
    where: { key: "manual-submissions" },
    update: {
      name: "Manual Submissions",
      type: SourceType.MANUAL,
      attribution: "Community submissions"
    },
    create: {
      key: "manual-submissions",
      name: "Manual Submissions",
      type: SourceType.MANUAL,
      attribution: "Community submissions"
    }
  });
}

function toCameraStatusFromHealth(result: SubmissionHealthCheckResult | null | undefined): CameraStatus {
  if (!result) {
    return CameraStatus.UNKNOWN;
  }

  return result.success ? CameraStatus.ONLINE : CameraStatus.OFFLINE;
}

function confidenceScoreFromHealth(result: SubmissionHealthCheckResult | null | undefined): number {
  if (!result) {
    return 0.45;
  }

  return result.success ? 0.84 : 0.18;
}

async function persistPromotionHealthCheck(
  prisma: PrismaClient,
  cameraId: string,
  submission: {
    embedUrl: string | null;
    imageUrl: string | null;
  },
  healthCheck: SubmissionHealthCheckResult | null | undefined
) {
  if (!healthCheck || !healthCheck.targetUrl) {
    return;
  }

  await prisma.cameraCheck.create({
    data: {
      cameraId,
      checkedAt: healthCheck.checkedAt,
      targetUrl: healthCheck.targetUrl,
      httpStatus: healthCheck.httpStatus,
      contentType: healthCheck.contentType,
      responseMs: healthCheck.responseMs ?? null,
      success: healthCheck.success,
      failureReason: healthCheck.failureReason,
      uptimePercent: healthCheck.success ? 100 : 0
    }
  });

  const normalizedImageUrl = normalizeUrl(submission.imageUrl);
  const normalizedEmbedUrl = normalizeUrl(submission.embedUrl);

  if (normalizedImageUrl && normalizedImageUrl === healthCheck.targetUrl) {
    await prisma.cameraImage.updateMany({
      where: {
        cameraId,
        url: normalizedImageUrl
      },
      data: {
        httpStatus: healthCheck.httpStatus,
        lastFetchedAt: healthCheck.checkedAt
      }
    });
  }

  if (normalizedEmbedUrl && normalizedEmbedUrl === healthCheck.targetUrl) {
    await prisma.cameraStream.updateMany({
      where: {
        cameraId,
        url: normalizedEmbedUrl
      },
      data: {
        status: healthCheck.success ? CameraStatus.ONLINE : CameraStatus.OFFLINE
      }
    });
  }
}

export async function promoteSubmissionToCamera(
  prisma: PrismaClient,
  submissionId: string,
  options: {
    requireSuccessfulHealthCheck?: boolean;
    prevalidatedHealthCheck?: SubmissionHealthCheckResult | null;
  } = {}
) {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      source: true
    }
  });

  if (!submission) {
    throw new Error("Submission not found");
  }

  if (submission.status === SubmissionStatus.APPROVED) {
    throw new Error("Submission has already been approved");
  }

  let healthCheck = options.prevalidatedHealthCheck ?? null;

  if (options.requireSuccessfulHealthCheck) {
    healthCheck = healthCheck ?? (await validateSubmissionHealth(submission));
    if (!healthCheck.success) {
      const failureReason =
        healthCheck.failureReason ?? "A successful media health check is required before bulk promotion.";

      await prisma.submission.update({
        where: { id: submission.id },
        data: {
          moderationNotes: `Health check required before promotion: ${failureReason}`,
          reviewedAt: new Date(),
          reviewedBy: "desktop-admin"
        }
      });

      throw new Error(failureReason);
    }
  }

  const duplicate = await findPotentialDuplicate(prisma, submission);
  if (duplicate) {
    throw new Error(`Potential duplicate camera already exists: ${duplicate.name}`);
  }

  const source = submission.source ?? (await ensureManualSource(prisma));
  const baseSlug = buildCameraSlug(
    `${submission.title}-${submission.stateCode ?? "us"}-${submission.city ?? "camera"}`
  );
  const slug = await ensureUniqueSlug(prisma, baseSlug || `submission-${submission.id}`);
  const normalizedEmbedUrl = normalizeUrl(submission.embedUrl);
  const normalizedImageUrl = normalizeUrl(submission.imageUrl);
  const streamType = normalizedEmbedUrl ? inferStreamType(normalizedEmbedUrl) : "unknown";
  const rawPayload = {
    ...(submission.raw && typeof submission.raw === "object" && !Array.isArray(submission.raw)
      ? (submission.raw as Record<string, unknown>)
      : {}),
    promotedFromSubmissionId: submission.id,
    promotedAt: new Date().toISOString()
  };

  const camera = await prisma.camera.create({
    data: {
      externalId: submission.id,
      sourceId: source.id,
      sourceType: SourceType.MANUAL,
      name: submission.title,
      slug,
      category: submission.category as CameraCategory,
      description: submission.notes,
      countryCode: resolveCountryCode(submission.raw),
      stateCode: submission.stateCode,
      city: submission.city,
      latitude: submission.latitude,
      longitude: submission.longitude,
      pageUrl: normalizeUrl(submission.sourceUrl),
      providerUrl: extractProviderUrl(submission.sourceUrl),
      status: toCameraStatusFromHealth(healthCheck),
      lastCheckedAt: healthCheck?.checkedAt ?? null,
      lastSuccessAt: healthCheck?.success ? healthCheck.checkedAt : null,
      confidenceScore: confidenceScoreFromHealth(healthCheck),
      raw: toJsonValue(rawPayload)
    }
  });

  if (normalizedEmbedUrl) {
    await prisma.cameraStream.create({
      data: {
        cameraId: camera.id,
        url: normalizedEmbedUrl,
        type: toStreamType(streamType),
        isEmbeddable: streamType === "hls" || streamType === "iframe" || streamType === "youtube",
        status: toCameraStatusFromHealth(healthCheck)
      }
    });
  }

  if (normalizedImageUrl) {
    await prisma.cameraImage.create({
      data: {
        cameraId: camera.id,
        url: normalizedImageUrl
      }
    });
  }

  await persistPromotionHealthCheck(prisma, camera.id, submission, healthCheck);

  await prisma.cameraAlias.create({
    data: {
      cameraId: camera.id,
      alias: submission.title,
      normalizedAlias: buildCameraSlug(submission.title)
    }
  });

  const nextSubmissionRaw = {
    ...(submission.raw && typeof submission.raw === "object" && !Array.isArray(submission.raw)
      ? (submission.raw as Record<string, unknown>)
      : {}),
    promotedCameraId: camera.id,
    promotedCameraSlug: camera.slug
  };

  await prisma.submission.update({
    where: { id: submission.id },
    data: {
      status: SubmissionStatus.APPROVED,
      reviewedAt: new Date(),
      reviewedBy: "desktop-admin",
      moderationNotes: healthCheck?.success
        ? "Promoted to live camera record after a successful health check."
        : "Promoted to live camera record from admin console.",
      raw: toJsonValue(nextSubmissionRaw)
    }
  });

  await prisma.auditLog.create({
    data: {
      actorType: AuditActorType.ADMIN,
      actorId: "desktop-admin",
      action: "submission.promote",
      entityType: "submission",
      entityId: submission.id,
      after: toJsonValue({
        submissionId: submission.id,
        cameraId: camera.id,
        cameraSlug: camera.slug
      })
    }
  });

  return {
    submissionId: submission.id,
    camera: {
      id: camera.id,
      slug: camera.slug,
      name: camera.name
    }
  };
}

export async function bulkPromoteSubmissionsToCameras(
  prisma: PrismaClient,
  options: {
    sourceKey?: string;
    status?: SubmissionStatus;
    limit?: number;
    requireSuccessfulHealthCheck?: boolean;
  } = {}
) {
  const submissions = await prisma.submission.findMany({
    where: {
      ...(options.status ? { status: options.status } : {}),
      ...(options.sourceKey ? { source: { key: options.sourceKey } } : {})
    },
    select: {
      id: true,
      title: true
    },
    orderBy: [{ updatedAt: "asc" }, { createdAt: "asc" }],
    take: options.limit ?? 20000
  });

  let promoted = 0;
  let duplicatesSkipped = 0;
  let failed = 0;
  const promotedCameras: Array<{ submissionId: string; slug: string; name: string }> = [];
  const failures: Array<{ submissionId: string; title: string; reason: string }> = [];

  for (const submission of submissions) {
    try {
      const healthCheck = options.requireSuccessfulHealthCheck
        ? await validateSubmissionHealth(
            await prisma.submission.findUniqueOrThrow({
              where: { id: submission.id },
              select: {
                sourceUrl: true,
                embedUrl: true,
                imageUrl: true
              }
            })
          )
        : null;

      const result = await promoteSubmissionToCamera(prisma, submission.id, {
        requireSuccessfulHealthCheck: options.requireSuccessfulHealthCheck,
        prevalidatedHealthCheck: healthCheck
      });
      promoted += 1;
      promotedCameras.push({
        submissionId: submission.id,
        slug: result.camera.slug,
        name: result.camera.name
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown promotion failure";
      if (message.toLowerCase().includes("potential duplicate camera already exists")) {
        duplicatesSkipped += 1;
      } else {
        failed += 1;
      }

      failures.push({
        submissionId: submission.id,
        title: submission.title,
        reason: message
      });
    }
  }

  return {
    totalMatched: submissions.length,
    promoted,
    duplicatesSkipped,
    failed,
    promotedCameras,
    failures
  };
}
