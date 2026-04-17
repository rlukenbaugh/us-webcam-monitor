import { CameraStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { deriveCameraVerification } from "@/lib/cameras/verification";

export const runtime = "nodejs";

const querySchema = z.object({
  limit: z.coerce.number().min(1).max(50).default(10)
});

export async function GET(request: NextRequest) {
  try {
    const parsed = querySchema.parse({
      limit: request.nextUrl.searchParams.get("limit") ?? undefined
    });

    const now = new Date();
    const favoritesWindow = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const checksWindow = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [favoriteGroups, checkGroups] = await Promise.all([
      prisma.favorite.groupBy({
        by: ["cameraId"],
        where: {
          cameraId: {
            not: null
          },
          createdAt: {
            gte: favoritesWindow
          }
        },
        _count: {
          _all: true
        }
      }),
      prisma.cameraCheck.groupBy({
        by: ["cameraId"],
        where: {
          checkedAt: {
            gte: checksWindow
          },
          success: true
        },
        _count: {
          _all: true
        }
      })
    ]);

    const favoriteCounts = new Map<string, number>();
    for (const group of favoriteGroups) {
      if (group.cameraId) {
        favoriteCounts.set(group.cameraId, group._count._all);
      }
    }

    const checkCounts = new Map<string, number>();
    for (const group of checkGroups) {
      checkCounts.set(group.cameraId, group._count._all);
    }

    const candidateIds = new Set<string>([
      ...favoriteCounts.keys(),
      ...checkCounts.keys()
    ]);

    let candidates = await prisma.camera.findMany({
      where: {
        id: {
          in: [...candidateIds]
        },
        isEnabled: true
      },
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
            name: true,
            key: true,
            type: true
          }
        }
      }
    });

    if (candidates.length < parsed.limit) {
      const fallback = await prisma.camera.findMany({
        where: {
          isEnabled: true,
          status: {
            in: [CameraStatus.ONLINE, CameraStatus.UNKNOWN]
          },
          id: {
            notIn: candidates.map((camera) => camera.id)
          }
        },
        orderBy: [{ confidenceScore: "desc" }, { updatedAt: "desc" }],
        take: parsed.limit * 2,
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
              name: true,
              key: true,
              type: true
            }
          }
        }
      });

      candidates = [...candidates, ...fallback];
    }

    const scored = candidates
      .map((camera) => {
        const favorites = favoriteCounts.get(camera.id) ?? 0;
        const successfulChecks = checkCounts.get(camera.id) ?? 0;
        const statusBoost = camera.status === CameraStatus.ONLINE ? 1 : 0;
        const trendingScore =
          favorites * 4 +
          successfulChecks * 1.5 +
          camera.confidenceScore * 2 +
          statusBoost;

        return {
          id: camera.id,
          slug: camera.slug,
          name: camera.name,
          category: camera.category.toLowerCase(),
          status: camera.status.toLowerCase(),
          stateCode: camera.stateCode,
          city: camera.city,
          latitude: camera.latitude,
          longitude: camera.longitude,
          source: {
            key: camera.source.key,
            name: camera.source.name,
            type: camera.source.type.toLowerCase()
          },
          verification: deriveCameraVerification({
            sourceKey: camera.source.key,
            sourceType: camera.source.type,
            status: camera.status,
            confidenceScore: camera.confidenceScore,
            lastCheckedAt: camera.lastCheckedAt,
            lastSuccessAt: camera.lastSuccessAt,
            raw: camera.raw
          }),
          stats: {
            favorites7d: favorites,
            successfulChecks24h: successfulChecks,
            confidenceScore: Number(camera.confidenceScore.toFixed(2)),
            trendingScore: Number(trendingScore.toFixed(2))
          }
        };
      })
      .sort((a, b) => b.stats.trendingScore - a.stats.trendingScore)
      .slice(0, parsed.limit);

    return NextResponse.json({
      count: scored.length,
      items: scored,
      windows: {
        favoritesDays: 7,
        checksHours: 24
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to compute trending cameras",
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
