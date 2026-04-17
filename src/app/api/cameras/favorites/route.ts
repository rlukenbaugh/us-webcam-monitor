import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const ids = (request.nextUrl.searchParams.get("ids") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0)
      .slice(0, 100);

    if (ids.length === 0) {
      return NextResponse.json({
        count: 0,
        items: []
      });
    }

    const records = await prisma.camera.findMany({
      where: {
        id: {
          in: ids
        }
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
        source: {
          select: {
            key: true,
            name: true,
            type: true
          }
        },
        streams: {
          where: { isPrimary: true },
          select: {
            type: true,
            url: true,
            isEmbeddable: true
          },
          take: 1
        },
        images: {
          where: { isPrimary: true },
          select: {
            url: true
          },
          take: 1
        }
      }
    });

    const order = new Map(ids.map((id, index) => [id, index]));
    records.sort((a, b) => (order.get(a.id) ?? 9999) - (order.get(b.id) ?? 9999));

    return NextResponse.json({
      count: records.length,
      items: records.map((camera) => ({
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
        image: camera.images[0] ? { url: camera.images[0].url } : null,
        lastCheckedAt: camera.lastCheckedAt?.toISOString() ?? null
      }))
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to load favorite cameras",
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}
