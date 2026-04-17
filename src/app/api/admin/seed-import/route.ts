import { promises as fs } from "node:fs";
import path from "node:path";
import { AuditActorType, SubmissionStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import {
  commitSeedImport,
  ensureSeedImportSource,
  prepareSeedImport
} from "@/lib/importers/seed-dataset-import";

export const runtime = "nodejs";

const formSchema = z.object({
  commit: z.preprocess((value) => value === "true" || value === "1", z.boolean().default(false)),
  useBundled: z.preprocess((value) => value === "true" || value === "1", z.boolean().default(false)),
  bulkApprove: z.preprocess((value) => value === "true" || value === "1", z.boolean().default(false)),
  limit: z.preprocess((value) => {
    if (!value) {
      return undefined;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  }, z.number().int().min(1).max(20000).optional())
});

async function readBundledSeedInputs() {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const candidateDirs = [
    path.resolve(process.cwd(), "data", "generated", "webcam_seed_batches"),
    path.resolve(process.cwd(), "..", "seed-batches"),
    typeof resourcesPath === "string"
      ? path.join(resourcesPath, "seed-batches")
      : null
  ].filter((value): value is string => Boolean(value));

  for (const directory of candidateDirs) {
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      const files = entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
        .map((entry) => path.join(directory, entry.name))
        .sort((left, right) => left.localeCompare(right));

      if (files.length === 0) {
        continue;
      }

      const inputs = await Promise.all(files.map((file) => fs.readFile(file, "utf8")));
      return {
        directory,
        inputs,
        fileCount: files.length
      };
    } catch {
      // Try the next candidate location.
    }
  }

  throw new Error("Bundled seed batch files were not found in the app or project directories");
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files").filter((value): value is File => value instanceof File);

    const parsed = formSchema.parse({
      commit: formData.get("commit"),
      useBundled: formData.get("useBundled"),
      bulkApprove: formData.get("bulkApprove"),
      limit: formData.get("limit")
    });

    if (!parsed.useBundled && files.length === 0) {
      return NextResponse.json(
        {
          message: "At least one JSON batch file is required, or use the bundled seed dataset option"
        },
        { status: 400 }
      );
    }

    const bundled = parsed.useBundled ? await readBundledSeedInputs() : null;
    const jsonInputs =
      bundled?.inputs ?? (await Promise.all(files.map((file) => file.text())));
    const prepared = prepareSeedImport(jsonInputs, {
      limit: bundled ? undefined : parsed.limit
    });

    let inserted = 0;
    let duplicatesSkipped = 0;
    let bulkApproved = 0;

    if (parsed.commit) {
      const result = await commitSeedImport(prisma, prepared.previews);
      inserted = result.inserted;
      duplicatesSkipped = result.duplicatesSkipped;

      if (parsed.bulkApprove) {
        const source = await ensureSeedImportSource(prisma);
        const updated = await prisma.submission.updateMany({
          where: {
            sourceId: source.id,
            status: SubmissionStatus.NEEDS_REVIEW
          },
          data: {
            status: SubmissionStatus.PENDING,
            reviewedAt: new Date(),
            reviewedBy: "desktop-admin",
            moderationNotes: "Bulk approved for later promotion from seed dataset import."
          }
        });
        bulkApproved = updated.count;

        await prisma.auditLog.create({
          data: {
            actorType: AuditActorType.ADMIN,
            actorId: "desktop-admin",
            action: "submission.bulk-approve.seed-import",
            entityType: "submission",
            entityId: source.id,
            after: {
              sourceId: source.id,
              bulkApproved
            }
          }
        });
      }
    }

    return NextResponse.json({
      mode: parsed.commit ? "commit" : "dry-run",
      source: bundled ? "bundled" : "upload",
      bundledDirectory: bundled?.directory ?? null,
      filesProcessed: bundled?.fileCount ?? files.length,
      totalRows: prepared.rows.length,
      commitReady: prepared.commitReady.length,
      skipped: prepared.skipped.length,
      inserted,
      duplicatesSkipped,
      bulkApproved,
      preview: prepared.previews.slice(0, 100)
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to import seed dataset JSON",
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}
