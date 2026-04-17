import { AuditActorType, SourceStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

const bodySchema = z.object({
  isEnabled: z.boolean()
});

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const params = await context.params;
    const parsed = bodySchema.parse(await request.json());

    const source = await prisma.source.findUnique({
      where: { id: params.id }
    });

    if (!source) {
      return NextResponse.json(
        {
          message: "Source not found",
          error: "Unknown source id"
        },
        { status: 404 }
      );
    }

    const updated = await prisma.source.update({
      where: { id: source.id },
      data: {
        isEnabled: parsed.isEnabled,
        status: parsed.isEnabled
          ? source.status === SourceStatus.DISABLED
            ? SourceStatus.ACTIVE
            : source.status
          : SourceStatus.DISABLED
      }
    });

    await prisma.auditLog.create({
      data: {
        actorType: AuditActorType.ADMIN,
        actorId: "desktop-admin",
        action: parsed.isEnabled ? "source.enable" : "source.disable",
        entityType: "source",
        entityId: source.id,
        before: {
          isEnabled: source.isEnabled,
          status: source.status
        },
        after: {
          isEnabled: updated.isEnabled,
          status: updated.status
        }
      }
    });

    return NextResponse.json({
      message: parsed.isEnabled
        ? `Enabled ${updated.name}.`
        : `Disabled ${updated.name}.`,
      source: {
        id: updated.id,
        isEnabled: updated.isEnabled,
        status: updated.status.toLowerCase()
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to update source status",
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}
