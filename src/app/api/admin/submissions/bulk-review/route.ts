import { AuditActorType, SubmissionStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

const bodySchema = z.object({
  action: z.enum(["approve", "reject"]),
  status: z.enum(["pending", "needs_review", "approved", "rejected", "all"]).default("needs_review")
});

function resolveStatusesForBulkAction(
  action: "approve" | "reject",
  status: "pending" | "needs_review" | "approved" | "rejected" | "all"
) {
  if (action === "approve") {
    switch (status) {
      case "needs_review":
        return [SubmissionStatus.NEEDS_REVIEW];
      case "rejected":
        return [SubmissionStatus.REJECTED];
      case "all":
        return [SubmissionStatus.NEEDS_REVIEW, SubmissionStatus.REJECTED];
      default:
        return [];
    }
  }

  switch (status) {
    case "pending":
      return [SubmissionStatus.PENDING];
    case "needs_review":
      return [SubmissionStatus.NEEDS_REVIEW];
    case "all":
      return [SubmissionStatus.PENDING, SubmissionStatus.NEEDS_REVIEW];
    default:
      return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = bodySchema.parse(await request.json());
    const eligibleStatuses = resolveStatusesForBulkAction(parsed.action, parsed.status);

    if (eligibleStatuses.length === 0) {
      return NextResponse.json({
        message: "No submissions matched that bulk action",
        updated: 0
      });
    }

    const nextStatus =
      parsed.action === "approve" ? SubmissionStatus.PENDING : SubmissionStatus.REJECTED;
    const moderationNotes =
      parsed.action === "approve"
        ? "Bulk queued for later promotion from the moderation queue."
        : "Bulk rejected from the moderation queue.";

    const updated = await prisma.submission.updateMany({
      where: {
        status: {
          in: eligibleStatuses
        }
      },
      data: {
        status: nextStatus,
        reviewedAt: new Date(),
        reviewedBy: "desktop-admin",
        moderationNotes
      }
    });

    await prisma.auditLog.create({
      data: {
        actorType: AuditActorType.ADMIN,
        actorId: "desktop-admin",
        action: `submission.bulk-${parsed.action}`,
        entityType: "submission",
        entityId: parsed.status,
        after: {
          filterStatus: parsed.status,
          nextStatus,
          updated: updated.count
        }
      }
    });

    return NextResponse.json({
      message:
        parsed.action === "approve"
          ? `Queued ${updated.count} submission${updated.count === 1 ? "" : "s"} for later promotion.`
          : `Bulk rejected ${updated.count} submission${updated.count === 1 ? "" : "s"}.`,
      updated: updated.count
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to bulk review submissions",
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}
