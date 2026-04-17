import { AuditActorType, SubmissionStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

const bodySchema = z.object({
  action: z.enum(["approve", "reject"]),
  moderationNotes: z.string().trim().max(500).optional()
});

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    const { id } = await context.params;
    const parsed = bodySchema.parse(await request.json());

    const submission = await prisma.submission.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        status: true,
        moderationNotes: true
      }
    });

    if (!submission) {
      return NextResponse.json(
        {
          message: "Submission not found"
        },
        { status: 404 }
      );
    }

    if (submission.status === SubmissionStatus.APPROVED) {
      return NextResponse.json(
        {
          message: "Submission has already been promoted to a live camera"
        },
        { status: 400 }
      );
    }

    const nextStatus =
      parsed.action === "approve" ? SubmissionStatus.PENDING : SubmissionStatus.REJECTED;

    const moderationNotes =
      parsed.moderationNotes && parsed.moderationNotes.length > 0
        ? parsed.moderationNotes
        : parsed.action === "approve"
          ? "Queued for later promotion from the moderation queue."
          : "Rejected from the moderation queue.";

    const updated = await prisma.submission.update({
      where: { id },
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
        action: `submission.${parsed.action}`,
        entityType: "submission",
        entityId: updated.id,
        after: {
          submissionId: updated.id,
          status: updated.status,
          moderationNotes
        }
      }
    });

    return NextResponse.json({
      message:
        parsed.action === "approve"
          ? `Queued "${submission.title}" for later promotion.`
          : `Rejected "${submission.title}".`,
      submission: {
        id: updated.id,
        status: updated.status.toLowerCase(),
        moderationNotes: updated.moderationNotes
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to review submission",
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}
