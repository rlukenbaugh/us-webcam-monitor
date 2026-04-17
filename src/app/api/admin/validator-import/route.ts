import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import {
  commitValidatorImport,
  prepareValidatorImport
} from "@/lib/importers/validator-json-import";

export const runtime = "nodejs";

const formSchema = z.object({
  commit: z.preprocess((value) => value === "true" || value === "1", z.boolean().default(false)),
  limit: z.preprocess((value) => {
    if (!value) {
      return undefined;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  }, z.number().int().min(1).max(20000).optional())
});

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files").filter((value): value is File => value instanceof File);

    const parsed = formSchema.parse({
      commit: formData.get("commit"),
      limit: formData.get("limit")
    });

    if (files.length === 0) {
      return NextResponse.json(
        {
          message: "At least one validator JSON file is required"
        },
        { status: 400 }
      );
    }

    const jsonInputs = await Promise.all(files.map((file) => file.text()));
    const prepared = prepareValidatorImport(jsonInputs, {
      limit: parsed.limit
    });

    let inserted = 0;
    let duplicatesSkipped = 0;

    if (parsed.commit) {
      const result = await commitValidatorImport(prisma, prepared.previews);
      inserted = result.inserted;
      duplicatesSkipped = result.duplicatesSkipped;
    }

    return NextResponse.json({
      mode: parsed.commit ? "commit" : "dry-run",
      filesProcessed: files.length,
      totalRows: prepared.rows.length,
      commitReady: prepared.commitReady.length,
      skipped: prepared.skipped.length,
      inserted,
      duplicatesSkipped,
      preview: prepared.previews.slice(0, 100)
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to import validator JSON",
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}
