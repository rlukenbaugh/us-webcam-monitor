import {
  CameraCategory,
  CameraStatus,
  Prisma,
  PrismaClient,
  RunStatus,
  SourceStatus,
  SourceType,
  StreamType
} from "@prisma/client";
import slugify from "slugify";
import { getAdapterByKey, registeredAdapters } from "@/lib/adapters";
import type {
  CameraCategoryNormalized,
  CameraStatusNormalized,
  NormalizedCameraRecord,
  SourceTypeNormalized,
  StreamTypeNormalized
} from "@/lib/adapters/types";

function toJsonValue(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toJsonArray(value: string[]): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toSourceType(value: SourceTypeNormalized): SourceType {
  switch (value) {
    case "dot":
      return SourceType.DOT;
    case "weather":
      return SourceType.WEATHER;
    case "tourism":
      return SourceType.TOURISM;
    case "manual":
    default:
      return SourceType.MANUAL;
  }
}

function toCategory(value: CameraCategoryNormalized): CameraCategory {
  switch (value) {
    case "traffic":
      return CameraCategory.TRAFFIC;
    case "weather":
      return CameraCategory.WEATHER;
    case "aviation":
      return CameraCategory.AVIATION;
    case "beach":
      return CameraCategory.BEACH;
    case "tourism":
      return CameraCategory.TOURISM;
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
    case "other":
    default:
      return CameraCategory.OTHER;
  }
}

function toStreamType(value: StreamTypeNormalized): StreamType {
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
    case "unknown":
    default:
      return StreamType.UNKNOWN;
  }
}

function toStatus(value: CameraStatusNormalized): CameraStatus {
  switch (value) {
    case "online":
      return CameraStatus.ONLINE;
    case "offline":
      return CameraStatus.OFFLINE;
    case "unknown":
    default:
      return CameraStatus.UNKNOWN;
  }
}

async function upsertNormalizedCamera(prisma: PrismaClient, record: NormalizedCameraRecord) {
  const source = await prisma.source.findUnique({
    where: { id: record.sourceId }
  });

  if (!source) {
    throw new Error(`Source not found for record ${record.name}`);
  }

  const slug =
    record.slug ||
    slugify(`${record.name}-${record.stateCode ?? "us"}-${record.externalId ?? "camera"}`, {
      lower: true,
      strict: true
    });

  const existing = await prisma.camera.findUnique({
    where: { slug },
    select: { id: true }
  });

  const region = record.stateCode
    ? await prisma.region.findFirst({
        where: {
          stateCode: record.stateCode,
          city: record.city ?? undefined
        }
      })
    : null;

  const camera = await prisma.camera.upsert({
    where: { slug },
    update: {
      externalId: record.externalId,
      sourceId: record.sourceId,
      sourceType: toSourceType(record.sourceType),
      name: record.name,
      category: toCategory(record.category),
      description: record.description,
      city: record.city,
      stateCode: record.stateCode,
      latitude: record.latitude,
      longitude: record.longitude,
      pageUrl: record.pageUrl,
      providerUrl: record.providerUrl,
      status: toStatus(record.status),
      lastCheckedAt: record.lastCheckedAt ? new Date(record.lastCheckedAt) : null,
      lastSuccessAt: record.lastSuccessAt ? new Date(record.lastSuccessAt) : null,
      confidenceScore: record.confidenceScore,
      regionId: region?.id ?? null,
      raw: toJsonValue(record.raw)
    },
    create: {
      externalId: record.externalId,
      sourceId: record.sourceId,
      sourceType: toSourceType(record.sourceType),
      name: record.name,
      slug,
      category: toCategory(record.category),
      description: record.description,
      city: record.city,
      stateCode: record.stateCode,
      latitude: record.latitude,
      longitude: record.longitude,
      pageUrl: record.pageUrl,
      providerUrl: record.providerUrl,
      status: toStatus(record.status),
      lastCheckedAt: record.lastCheckedAt ? new Date(record.lastCheckedAt) : null,
      lastSuccessAt: record.lastSuccessAt ? new Date(record.lastSuccessAt) : null,
      confidenceScore: record.confidenceScore,
      regionId: region?.id ?? null,
      raw: toJsonValue(record.raw)
    }
  });

  await prisma.$transaction([
    prisma.cameraStream.deleteMany({ where: { cameraId: camera.id } }),
    prisma.cameraImage.deleteMany({ where: { cameraId: camera.id } }),
    prisma.cameraTag.deleteMany({ where: { cameraId: camera.id } })
  ]);

  if (record.streamUrl) {
    await prisma.cameraStream.create({
      data: {
        cameraId: camera.id,
        url: record.streamUrl,
        type: toStreamType(record.streamType),
        isEmbeddable: ["hls", "iframe", "youtube"].includes(record.streamType),
        status: toStatus(record.status)
      }
    });
  }

  if (record.imageUrl) {
    await prisma.cameraImage.create({
      data: {
        cameraId: camera.id,
        url: record.imageUrl,
        lastFetchedAt: record.lastCheckedAt ? new Date(record.lastCheckedAt) : undefined
      }
    });
  }

  for (const tagName of record.tags) {
    const sluggedTag = slugify(tagName, { lower: true, strict: true });
    const tag = await prisma.tag.upsert({
      where: { slug: sluggedTag },
      update: { name: tagName },
      create: {
        name: tagName,
        slug: sluggedTag
      }
    });

    await prisma.cameraTag.create({
      data: {
        cameraId: camera.id,
        tagId: tag.id
      }
    });
  }

  await prisma.cameraAlias.upsert({
    where: {
      cameraId_normalizedAlias: {
        cameraId: camera.id,
        normalizedAlias: slugify(record.name, { lower: true, strict: true })
      }
    },
    update: {
      alias: record.name
    },
    create: {
      cameraId: camera.id,
      alias: record.name,
      normalizedAlias: slugify(record.name, { lower: true, strict: true })
    }
  });

  return {
    cameraId: camera.id,
    wasUpdate: Boolean(existing)
  };
}

export type SourceSyncResult = {
  sourceId: string;
  sourceKey: string;
  runId: string;
  fetchedCount: number;
  normalizedCount: number;
  insertedCount: number;
  updatedCount: number;
  failedCount: number;
  duplicateCount: number;
  errors: string[];
  status: RunStatus;
};

export async function syncSourceByKey(
  prisma: PrismaClient,
  sourceKey: string,
  options: {
    ignoreDisabled?: boolean;
  } = {}
): Promise<SourceSyncResult> {
  const source = await prisma.source.findUnique({
    where: { key: sourceKey }
  });

  if (!source) {
    throw new Error(`Source "${sourceKey}" was not found`);
  }

  if ((!source.isEnabled || source.status === SourceStatus.DISABLED) && !options.ignoreDisabled) {
    throw new Error(`Source "${source.name}" is disabled`);
  }

  const adapter = getAdapterByKey(source.key);

  if (!adapter) {
    throw new Error(`No registered adapter is available for "${source.name}"`);
  }

  const run = await prisma.sourceRun.create({
    data: {
      sourceId: source.id,
      status: RunStatus.RUNNING
    }
  });

  try {
    const result = await adapter.run({
      sourceKey: source.key,
      sourceId: source.id,
      sourceName: source.name
    });

    let insertedCount = 0;
    let updatedCount = 0;

    for (const record of result.normalized) {
      const upsertResult = await upsertNormalizedCamera(prisma, record);
      if (upsertResult.wasUpdate) {
        updatedCount += 1;
      } else {
        insertedCount += 1;
      }
    }

    const runStatus = result.errors.length > 0 ? RunStatus.PARTIAL : RunStatus.SUCCESS;
    const failedCount = result.errors.length;
    const duplicateCount = Math.max(result.fetchedCount - result.normalized.length, 0);
    const finishedAt = new Date();

    await prisma.sourceRun.update({
      where: { id: run.id },
      data: {
        endedAt: finishedAt,
        status: runStatus,
        fetchedCount: result.fetchedCount,
        normalizedCount: result.normalized.length,
        insertedCount,
        updatedCount,
        failedCount,
        duplicateCount,
        errorSummary: result.errors.length > 0 ? result.errors.join("; ").slice(0, 500) : null,
        errors: result.errors.length > 0 ? toJsonArray(result.errors) : undefined
      }
    });

    await prisma.source.update({
      where: { id: source.id },
      data: {
        lastRunAt: finishedAt,
        status: result.errors.length > 0 ? SourceStatus.ERROR : SourceStatus.ACTIVE,
        isEnabled: true
      }
    });

    return {
      sourceId: source.id,
      sourceKey: source.key,
      runId: run.id,
      fetchedCount: result.fetchedCount,
      normalizedCount: result.normalized.length,
      insertedCount,
      updatedCount,
      failedCount,
      duplicateCount,
      errors: result.errors,
      status: runStatus
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown adapter import error";
    const finishedAt = new Date();

    await prisma.sourceRun.update({
      where: { id: run.id },
      data: {
        endedAt: finishedAt,
        status: RunStatus.FAILED,
        failedCount: 1,
        errorSummary: message,
        errors: toJsonArray([message])
      }
    });

    await prisma.source.update({
      where: { id: source.id },
      data: {
        lastRunAt: finishedAt,
        status: SourceStatus.ERROR
      }
    });

    throw error;
  }
}

export async function syncAllRegisteredSources(prisma: PrismaClient) {
  const results: SourceSyncResult[] = [];

  for (const adapter of registeredAdapters) {
    const source = await prisma.source.findUnique({
      where: { key: adapter.key },
      select: {
        id: true,
        isEnabled: true,
        status: true
      }
    });

    if (!source) {
      results.push({
        sourceId: "missing-source",
        sourceKey: adapter.key,
        runId: "missing-source",
        fetchedCount: 0,
        normalizedCount: 0,
        insertedCount: 0,
        updatedCount: 0,
        failedCount: 1,
        duplicateCount: 0,
        errors: [`Source row is missing for ${adapter.key}`],
        status: RunStatus.FAILED
      });
      continue;
    }

    if (!source.isEnabled || source.status === SourceStatus.DISABLED) {
      results.push({
        sourceId: source.id,
        sourceKey: adapter.key,
        runId: "skipped-disabled",
        fetchedCount: 0,
        normalizedCount: 0,
        insertedCount: 0,
        updatedCount: 0,
        failedCount: 0,
        duplicateCount: 0,
        errors: [],
        status: RunStatus.SUCCESS
      });
      continue;
    }

    try {
      const result = await syncSourceByKey(prisma, adapter.key);
      results.push(result);
    } catch (error) {
      results.push({
        sourceId: source.id,
        sourceKey: adapter.key,
        runId: "failed-before-run",
        fetchedCount: 0,
        normalizedCount: 0,
        insertedCount: 0,
        updatedCount: 0,
        failedCount: 1,
        duplicateCount: 0,
        errors: [error instanceof Error ? error.message : "Unknown source sync error"],
        status: RunStatus.FAILED
      });
    }
  }

  return results;
}
