import { AuditActorType } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { syncSourceByKey } from "@/lib/sources/source-sync";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_: Request, context: RouteContext) {
  try {
    const params = await context.params;

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

    const result = await syncSourceByKey(prisma, source.key);

    await prisma.auditLog.create({
      data: {
        actorType: AuditActorType.ADMIN,
        actorId: "desktop-admin",
        action: "source.rerun",
        entityType: "source",
        entityId: source.id,
        after: {
          sourceKey: source.key,
          runId: result.runId,
          status: result.status,
          fetchedCount: result.fetchedCount,
          normalizedCount: result.normalizedCount,
          insertedCount: result.insertedCount,
          updatedCount: result.updatedCount,
          failedCount: result.failedCount,
          duplicateCount: result.duplicateCount
        }
      }
    });

    return NextResponse.json({
      message:
        result.status === "FAILED"
          ? `Source rerun completed with failures for ${source.name}.`
          : `Reran ${source.name}: ${result.insertedCount} inserted, ${result.updatedCount} updated.`,
      result: {
        status: result.status.toLowerCase(),
        fetchedCount: result.fetchedCount,
        normalizedCount: result.normalizedCount,
        insertedCount: result.insertedCount,
        updatedCount: result.updatedCount,
        failedCount: result.failedCount,
        duplicateCount: result.duplicateCount
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to rerun source",
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}
