import { SubmissionStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { bulkPromoteSubmissionsToCameras } from "@/lib/admin/submission-promotion";

export const runtime = "nodejs";

const bodySchema = z.object({
  sourceKey: z.string().trim().min(1).optional(),
  status: z.enum(["pending", "needs_review", "approved", "rejected"]).default("pending"),
  limit: z.number().int().min(1).max(20000).optional(),
  requireSuccessfulHealthCheck: z.boolean().default(true)
});

function toSubmissionStatus(status: "pending" | "needs_review" | "approved" | "rejected") {
  switch (status) {
    case "needs_review":
      return SubmissionStatus.NEEDS_REVIEW;
    case "approved":
      return SubmissionStatus.APPROVED;
    case "rejected":
      return SubmissionStatus.REJECTED;
    default:
      return SubmissionStatus.PENDING;
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = bodySchema.parse(await request.json());
    const result = await bulkPromoteSubmissionsToCameras(prisma, {
      sourceKey: parsed.sourceKey,
      status: toSubmissionStatus(parsed.status),
      limit: parsed.limit,
      requireSuccessfulHealthCheck: parsed.requireSuccessfulHealthCheck
    });

    return NextResponse.json({
      message:
        result.promoted > 0
          ? `Promoted ${result.promoted} submission${result.promoted === 1 ? "" : "s"} to live cameras after validation.`
          : "No pending submissions passed promotion validation.",
      ...result
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to bulk promote submissions",
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}
