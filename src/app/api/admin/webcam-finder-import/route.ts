import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import {
  commitFinderImport,
  type InferredLocation,
  prepareFinderImport
} from "@/lib/importers/webcam-finder-import";

export const runtime = "nodejs";

const formSchema = z.object({
  commit: z.preprocess((value) => value === "true" || value === "1", z.boolean().default(false)),
  limit: z.preprocess((value) => {
    if (!value) {
      return undefined;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  }, z.number().int().min(1).max(5000).optional()),
  stateCode: z.preprocess((value) => (typeof value === "string" && value.trim().length > 0 ? value.trim().toUpperCase() : undefined), z.string().length(2).optional()),
  city: z.preprocess((value) => (typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined), z.string().max(120).optional()),
  lat: z.preprocess((value) => {
    if (!value) {
      return undefined;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  }, z.number().min(-90).max(90).optional()),
  lng: z.preprocess((value) => {
    if (!value) {
      return undefined;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  }, z.number().min(-180).max(180).optional())
});

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          message: "CSV file is required"
        },
        { status: 400 }
      );
    }

    const parsed = formSchema.parse({
      commit: formData.get("commit"),
      limit: formData.get("limit"),
      stateCode: formData.get("stateCode"),
      city: formData.get("city"),
      lat: formData.get("lat"),
      lng: formData.get("lng")
    });

    const csvText = await file.text();
    const fallbackLocation: InferredLocation | null =
      typeof parsed.lat === "number" && typeof parsed.lng === "number"
        ? {
            latitude: parsed.lat,
            longitude: parsed.lng,
            stateCode: parsed.stateCode ?? null,
            city: parsed.city ?? null
          }
        : null;

    const prepared = prepareFinderImport(csvText, {
      limit: parsed.limit,
      fallbackLocation
    });

    let inserted = 0;
    let duplicatesSkipped = 0;

    if (parsed.commit) {
      const result = await commitFinderImport(prisma, prepared.previews);
      inserted = result.inserted;
      duplicatesSkipped = result.duplicatesSkipped;
    }

    return NextResponse.json({
      mode: parsed.commit ? "commit" : "dry-run",
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
        message: "Failed to import webcam finder CSV",
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}
