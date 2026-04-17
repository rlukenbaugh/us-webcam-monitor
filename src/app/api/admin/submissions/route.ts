import { SubmissionStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

const querySchema = z.object({
  status: z.enum(["pending", "needs_review", "approved", "rejected", "all"]).default("needs_review"),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

export async function GET(request: NextRequest) {
  try {
    const parsed = querySchema.parse({
      status: request.nextUrl.searchParams.get("status") ?? "needs_review",
      limit: request.nextUrl.searchParams.get("limit") ?? "50"
    });

    const statusFilter =
      parsed.status === "all"
        ? undefined
        : parsed.status === "pending"
          ? SubmissionStatus.PENDING
          : parsed.status === "needs_review"
            ? SubmissionStatus.NEEDS_REVIEW
            : parsed.status === "approved"
              ? SubmissionStatus.APPROVED
              : SubmissionStatus.REJECTED;

    const submissions = await prisma.submission.findMany({
      where: statusFilter ? { status: statusFilter } : undefined,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: parsed.limit,
      include: {
        source: {
          select: {
            key: true,
            name: true,
            type: true
          }
        }
      }
    });

    const summary = await prisma.submission.groupBy({
      by: ["status"],
      _count: {
        _all: true
      }
    });

    return NextResponse.json({
      count: submissions.length,
      items: submissions.map((submission) => ({
        id: submission.id,
        title: submission.title,
        sourceUrl: submission.sourceUrl,
        embedUrl: submission.embedUrl,
        imageUrl: submission.imageUrl,
        latitude: submission.latitude,
        longitude: submission.longitude,
        stateCode: submission.stateCode,
        city: submission.city,
        category: submission.category.toLowerCase(),
        notes: submission.notes,
        status: submission.status.toLowerCase(),
        moderationNotes: submission.moderationNotes,
        reviewedAt: submission.reviewedAt?.toISOString() ?? null,
        reviewedBy: submission.reviewedBy,
        createdAt: submission.createdAt.toISOString(),
        updatedAt: submission.updatedAt.toISOString(),
        source: submission.source
          ? {
              key: submission.source.key,
              name: submission.source.name,
              type: submission.source.type.toLowerCase()
            }
          : null,
        raw: submission.raw
      })),
      summary: summary.reduce<Record<string, number>>((accumulator, item) => {
        accumulator[item.status.toLowerCase()] = item._count._all;
        return accumulator;
      }, {})
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to load submissions",
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}
