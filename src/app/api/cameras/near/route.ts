import { CameraStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { deriveCameraVerification } from "@/lib/cameras/verification";

export const runtime = "nodejs";

const earthRadiusMiles = 3958.8;

const nearQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusMiles: z.coerce.number().min(1).max(500).default(50),
  limit: z.coerce.number().min(1).max(200).default(25),
  working: z.preprocess(
    (value) => ["1", "true", "yes", "on"].includes(String(value ?? "").toLowerCase()),
    z.boolean().default(false)
  )
});

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const lat1 = toRadians(aLat);
  const lat2 = toRadians(bLat);

  const arc =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * earthRadiusMiles * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

export async function GET(request: NextRequest) {
  try {
    const parsed = nearQuerySchema.parse({
      lat: request.nextUrl.searchParams.get("lat") ?? undefined,
      lng: request.nextUrl.searchParams.get("lng") ?? undefined,
      radiusMiles: request.nextUrl.searchParams.get("radiusMiles") ?? undefined,
      limit: request.nextUrl.searchParams.get("limit") ?? undefined,
      working: request.nextUrl.searchParams.get("working") ?? undefined
    });

    const latRange = parsed.radiusMiles / 69;
    const lngDivisor = Math.cos(toRadians(parsed.lat));
    const lngRange = parsed.radiusMiles / (Math.max(Math.abs(lngDivisor), 0.15) * 69);

    const select = {
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
    } as const;

    const records = await prisma.camera.findMany({
      where: {
        isEnabled: true,
        latitude: {
          gte: parsed.lat - latRange,
          lte: parsed.lat + latRange
        },
        longitude: {
          gte: parsed.lng - lngRange,
          lte: parsed.lng + lngRange
        },
        ...(parsed.working ? { status: CameraStatus.ONLINE } : {})
      },
      select,
      take: 2000
    });

    const sortByDistance = (rows: typeof records) =>
      rows
        .map((camera) => ({
          camera,
          distanceMiles: haversineMiles(parsed.lat, parsed.lng, camera.latitude, camera.longitude)
        }))
        .sort((a, b) => a.distanceMiles - b.distanceMiles);

    let sortedByDistance = sortByDistance(records);

    if (sortedByDistance.length === 0) {
      const fallbackRecords = await prisma.camera.findMany({
        where: {
          isEnabled: true,
          ...(parsed.working ? { status: CameraStatus.ONLINE } : {})
        },
        select,
        take: 5000
      });

      sortedByDistance = sortByDistance(fallbackRecords);
    }

    const withinRadius = sortedByDistance
      .filter((entry) => entry.distanceMiles <= parsed.radiusMiles);

    const selected = (withinRadius.length > 0 ? withinRadius : sortedByDistance)
      .slice(0, parsed.limit);

    const withDistance = selected
      .map((camera) => ({
        id: camera.camera.id,
        slug: camera.camera.slug,
        name: camera.camera.name,
        category: camera.camera.category.toLowerCase(),
        status: camera.camera.status.toLowerCase(),
        confidenceScore: camera.camera.confidenceScore,
        stateCode: camera.camera.stateCode,
        city: camera.camera.city,
        latitude: camera.camera.latitude,
        longitude: camera.camera.longitude,
        distanceMiles: Number(camera.distanceMiles.toFixed(2)),
        source: {
          key: camera.camera.source.key,
          name: camera.camera.source.name,
          type: camera.camera.source.type.toLowerCase()
        },
        stream: camera.camera.streams[0]
          ? {
              type: camera.camera.streams[0].type.toLowerCase(),
              url: camera.camera.streams[0].url,
              isEmbeddable: camera.camera.streams[0].isEmbeddable
            }
          : null,
        image: camera.camera.images[0]
          ? {
              url: camera.camera.images[0].url
            }
          : null,
        lastCheckedAt: camera.camera.lastCheckedAt?.toISOString() ?? null,
        verification: deriveCameraVerification({
          sourceKey: camera.camera.source.key,
          sourceType: camera.camera.source.type,
          status: camera.camera.status,
          confidenceScore: camera.camera.confidenceScore,
          lastCheckedAt: camera.camera.lastCheckedAt,
          lastSuccessAt: camera.camera.lastSuccessAt,
          raw: camera.camera.raw
        })
      }));

    return NextResponse.json({
      center: {
        lat: parsed.lat,
        lng: parsed.lng,
        radiusMiles: parsed.radiusMiles
      },
      fallbackToNearest: withinRadius.length === 0 && sortedByDistance.length > 0,
      count: withDistance.length,
      items: withDistance
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to fetch nearby cameras",
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}
