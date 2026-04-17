import fs from "fs";
import path from "path";
import { CameraStatus, PrismaClient } from "@prisma/client";

for (const envFile of [path.resolve(process.cwd(), ".env.local"), path.resolve(process.cwd(), ".env")]) {
  if (fs.existsSync(envFile) && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(envFile);
  }
}

process.env.DATABASE_URL = process.env.DATABASE_URL || "file:./dev.db";

const prisma = new PrismaClient();
const REQUEST_TIMEOUT_MS = Number(process.env.IMAGE_CHECK_TIMEOUT_MS ?? 10000);
const MAX_IMAGE_CHECKS = Number(process.env.MAX_IMAGE_CHECKS ?? 250);

async function fetchWithTimeout(input: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": "us-webcam-monitor/0.1",
        ...(init.headers ?? {})
      },
      cache: "no-store"
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function checkImage(url: string) {
  try {
    const headResponse = await fetchWithTimeout(url, {
      method: "HEAD",
      redirect: "follow"
    });

    if (headResponse.ok) {
      return {
        success: true,
        httpStatus: headResponse.status,
        contentType: headResponse.headers.get("content-type"),
        failureReason: null as string | null
      };
    }

    if (![403, 405].includes(headResponse.status)) {
      return {
        success: false,
        httpStatus: headResponse.status,
        contentType: headResponse.headers.get("content-type"),
        failureReason: `HEAD request failed with ${headResponse.status}`
      };
    }
  } catch (error) {
    if (!(error instanceof Error)) {
      return {
        success: false,
        httpStatus: null,
        contentType: null,
        failureReason: "Unknown HEAD request error"
      };
    }
  }

  try {
    const getResponse = await fetchWithTimeout(url, {
      method: "GET",
      redirect: "follow"
    });

    return {
      success: getResponse.ok,
      httpStatus: getResponse.status,
      contentType: getResponse.headers.get("content-type"),
      failureReason: getResponse.ok ? null : `GET request failed with ${getResponse.status}`
    };
  } catch (error) {
    return {
      success: false,
      httpStatus: null,
      contentType: null,
      failureReason: error instanceof Error ? error.message : "Unknown GET request error"
    };
  }
}

async function calculateUptimePercent(cameraId: string) {
  const recentChecks = await prisma.cameraCheck.findMany({
    where: { cameraId },
    orderBy: { checkedAt: "desc" },
    take: 20,
    select: { success: true }
  });

  if (recentChecks.length === 0) {
    return null;
  }

  const successCount = recentChecks.filter((item) => item.success).length;
  return Number(((successCount / recentChecks.length) * 100).toFixed(2));
}

async function main() {
  const images = await prisma.cameraImage.findMany({
    take: MAX_IMAGE_CHECKS,
    orderBy: [{ lastFetchedAt: "asc" }, { updatedAt: "asc" }],
    include: {
      camera: {
        select: {
          id: true,
          confidenceScore: true,
          lastSuccessAt: true
        }
      }
    }
  });

  let checked = 0;
  let successes = 0;
  let failures = 0;

  for (const image of images) {
    const result = await checkImage(image.url);
    const checkedAt = new Date();

    await prisma.cameraImage.update({
      where: { id: image.id },
      data: {
        lastFetchedAt: checkedAt,
        httpStatus: result.httpStatus ?? null
      }
    });

    const createdCheck = await prisma.cameraCheck.create({
      data: {
        cameraId: image.cameraId,
        checkedAt,
        targetUrl: image.url,
        httpStatus: result.httpStatus ?? null,
        contentType: result.contentType ?? null,
        success: result.success,
        failureReason: result.failureReason
      }
    });

    const uptimePercent = await calculateUptimePercent(image.cameraId);
    await prisma.cameraCheck.update({
      where: { id: createdCheck.id },
      data: {
        uptimePercent
      }
    });

    const nextConfidence = result.success
      ? Math.min(Math.max(image.camera.confidenceScore, 0.55) + 0.03, 0.98)
      : Math.max(image.camera.confidenceScore - 0.08, 0.1);

    await prisma.camera.update({
      where: { id: image.cameraId },
      data: {
        status: result.success ? CameraStatus.ONLINE : CameraStatus.OFFLINE,
        lastCheckedAt: checkedAt,
        lastSuccessAt: result.success ? checkedAt : image.camera.lastSuccessAt,
        confidenceScore: nextConfidence
      }
    });

    checked += 1;
    if (result.success) {
      successes += 1;
    } else {
      failures += 1;
    }
  }

  console.log(
    `[image-check] checked=${checked} success=${successes} failed=${failures} max=${MAX_IMAGE_CHECKS}`
  );
}

main()
  .catch((error) => {
    console.error("[image-check] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
