import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { promoteSubmissionToCamera } from "@/lib/admin/submission-promotion";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_: Request, context: RouteContext) {
  try {
    const params = await context.params;
    const result = await promoteSubmissionToCamera(prisma, params.id);

    return NextResponse.json({
      message: "Submission promoted successfully",
      ...result
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to promote submission",
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}
