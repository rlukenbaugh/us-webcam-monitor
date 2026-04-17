import { AuditActorType } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const params = await context.params;
    const camera = await prisma.camera.findUnique({
      where: { slug: params.slug },
      select: {
        id: true,
        slug: true,
        name: true
      }
    });

    if (!camera) {
      return NextResponse.json(
        {
          message: "Camera not found"
        },
        { status: 404 }
      );
    }

    const userAgent = request.headers.get("user-agent");

    await prisma.auditLog.create({
      data: {
        actorType: AuditActorType.ANONYMOUS,
        action: "camera.report_broken",
        entityType: "camera",
        entityId: camera.id,
        after: {
          cameraId: camera.id,
          cameraSlug: camera.slug,
          cameraName: camera.name,
          reportedAt: new Date().toISOString()
        },
        userAgent
      }
    });

    return NextResponse.json({
      message: "Broken feed report submitted for review."
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to report broken feed",
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}
