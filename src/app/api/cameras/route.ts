import { CameraCategory, CameraStatus, Prisma, SourceType, StreamType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { deriveCameraVerification } from "@/lib/cameras/verification";
import { parseCameraQuery } from "@/lib/validation/camera-query";

export const runtime = "nodejs";

const stormFocusedCategories: CameraCategory[] = [
  CameraCategory.WEATHER,
  CameraCategory.AVIATION,
  CameraCategory.BEACH,
  CameraCategory.HARBOR,
  CameraCategory.TRAFFIC
];

type CameraListItem = {
  id: string;
  slug: string;
  name: string;
  category: string;
  status: string;
  confidenceScore: number;
  stateCode: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
  source: {
    key: string;
    name: string;
    type: string;
  };
  stream: {
    type: string;
    url: string;
    isEmbeddable: boolean;
  } | null;
  image: {
    url: string;
  } | null;
  lastCheckedAt: string | null;
  verification: {
    isVerified: boolean;
    isReferenceOnly: boolean;
    sourceClass: "official" | "community" | "seed";
    label: string;
    summary: string;
  };
};

const liveStreamTypes: StreamType[] = [
  StreamType.HLS,
  StreamType.MJPEG,
  StreamType.IFRAME,
  StreamType.YOUTUBE
];

function hasLiveStreamsCondition(): Prisma.CameraWhereInput {
  return {
    streams: {
      some: {
        type: {
          in: liveStreamTypes
        }
      }
    }
  };
}

function hasSnapshotCondition(): Prisma.CameraWhereInput {
  return {
    OR: [
      {
        streams: {
          some: {
            type: StreamType.JPEG
          }
        }
      },
      {
        images: {
          some: {}
        }
      }
    ]
  };
}

function buildSearchCondition(term: string): Prisma.CameraWhereInput {
  return {
    OR: [
      { name: { contains: term } },
      { city: { contains: term } },
      { stateCode: { contains: term } },
      { source: { name: { contains: term } } },
      { source: { key: { contains: term } } }
    ]
  };
}

export async function GET(request: NextRequest) {
  try {
    const query = parseCameraQuery(request.nextUrl.searchParams);
    const [minLng, minLat, maxLng, maxLat] = query.bbox;

    const where: Prisma.CameraWhereInput = {
      isEnabled: true,
      latitude: {
        gte: minLat,
        lte: maxLat
      },
      longitude: {
        gte: minLng,
        lte: maxLng
      }
    };

    const andConditions: Prisma.CameraWhereInput[] = [];

    if (query.q) {
      andConditions.push(buildSearchCondition(query.q));
    }

    if (query.categories.length > 0) {
      andConditions.push({
        category: {
          in: query.categories
        }
      });
    } else if (query.stormView) {
      andConditions.push({
        category: {
          in: stormFocusedCategories
        }
      });
    }

    if (query.sourceTypes.length > 0) {
      andConditions.push({
        sourceType: {
          in: query.sourceTypes
        }
      });
    }

    if (query.streamTypes.length > 0) {
      andConditions.push({
        streams: {
          some: {
            type: {
              in: query.streamTypes
            }
          }
        }
      });
    }

    if (query.state) {
      andConditions.push({ stateCode: query.state });
    }

    if (query.working) {
      andConditions.push({ status: CameraStatus.ONLINE });
    }

    if (query.liveOnly && !query.snapshotOnly) {
      andConditions.push(hasLiveStreamsCondition());
    } else if (query.snapshotOnly && !query.liveOnly) {
      andConditions.push(hasSnapshotCondition());
    } else if (query.liveOnly && query.snapshotOnly) {
      andConditions.push({
        OR: [hasLiveStreamsCondition(), hasSnapshotCondition()]
      });
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    const records = await prisma.camera.findMany({
      where,
      select: {
        id: true,
        slug: true,
        name: true,
        category: true,
        status: true,
        confidenceScore: true,
        stateCode: true,
        city: true,
        latitude: true,
        longitude: true,
        lastCheckedAt: true,
        lastSuccessAt: true,
        raw: true,
        source: {
          select: {
            key: true,
            name: true,
            type: true
          }
        },
        streams: {
          where: {
            isPrimary: true
          },
          select: {
            type: true,
            url: true,
            isEmbeddable: true
          },
          take: 1
        },
        images: {
          where: {
            isPrimary: true
          },
          select: {
            url: true
          },
          take: 1
        }
      },
      orderBy: query.stormView
        ? [{ status: "asc" }, { confidenceScore: "desc" }, { updatedAt: "desc" }]
        : [{ confidenceScore: "desc" }, { updatedAt: "desc" }],
      take: query.limit + 1
    });

    const hasMore = records.length > query.limit;
    const cameras = records
      .slice(0, query.limit)
      .map<CameraListItem>((camera) => ({
        id: camera.id,
        slug: camera.slug,
        name: camera.name,
        category: camera.category.toLowerCase(),
        status: camera.status.toLowerCase(),
        confidenceScore: camera.confidenceScore,
        stateCode: camera.stateCode,
        city: camera.city,
        latitude: camera.latitude,
        longitude: camera.longitude,
        source: {
          key: camera.source.key,
          name: camera.source.name,
          type: camera.source.type.toLowerCase()
        },
        stream: camera.streams[0]
          ? {
              type: camera.streams[0].type.toLowerCase(),
              url: camera.streams[0].url,
              isEmbeddable: camera.streams[0].isEmbeddable
            }
          : null,
        image: camera.images[0]
          ? {
              url: camera.images[0].url
            }
          : null,
        lastCheckedAt: camera.lastCheckedAt?.toISOString() ?? null,
        verification: deriveCameraVerification({
          sourceKey: camera.source.key,
          sourceType: camera.source.type,
          status: camera.status,
          confidenceScore: camera.confidenceScore,
          lastCheckedAt: camera.lastCheckedAt,
          lastSuccessAt: camera.lastSuccessAt,
          raw: camera.raw
        })
      }))
      .sort((a, b) => {
        if (a.verification.isVerified !== b.verification.isVerified) {
          return a.verification.isVerified ? -1 : 1;
        }
        return b.confidenceScore - a.confidenceScore;
      });

    return NextResponse.json({
      items: cameras,
      hasMore,
      count: cameras.length,
      filterMeta: {
        sourceTypes: Object.values(SourceType).map((value) => value.toLowerCase()),
        streamTypes: Object.values(StreamType).map((value) => value.toLowerCase())
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to query cameras",
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
