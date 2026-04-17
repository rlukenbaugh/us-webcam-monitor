import { CameraStatus, SourceType } from "@prisma/client";

type VerificationInput = {
  sourceKey: string;
  sourceType: SourceType;
  status: CameraStatus;
  confidenceScore: number;
  lastCheckedAt: Date | null;
  lastSuccessAt: Date | null;
  raw: unknown;
};

export type CameraVerification = {
  isVerified: boolean;
  isReferenceOnly: boolean;
  sourceClass: "official" | "community" | "seed";
  label: string;
  summary: string;
};

function isSeedDataset(raw: unknown, sourceKey: string): boolean {
  if (sourceKey === "seed-dataset-import") {
    return true;
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return false;
  }

  const importedFrom = (raw as Record<string, unknown>).importedFrom;
  return importedFrom === "seed_dataset_json";
}

export function deriveCameraVerification(input: VerificationInput): CameraVerification {
  const sourceClass =
    isSeedDataset(input.raw, input.sourceKey)
      ? "seed"
      : input.sourceType === SourceType.MANUAL
        ? "community"
        : "official";

  const hasRecentSuccess =
    input.lastSuccessAt !== null &&
    Date.now() - input.lastSuccessAt.getTime() <= 14 * 24 * 60 * 60 * 1000;

  const hasStrongSignal =
    input.status === CameraStatus.ONLINE &&
    input.confidenceScore >= 0.75;

  const isVerified = sourceClass !== "seed" && (hasRecentSuccess || hasStrongSignal);
  const isReferenceOnly = !isVerified;

  if (isVerified) {
    return {
      isVerified: true,
      isReferenceOnly: false,
      sourceClass,
      label: "Verified feed",
      summary: hasRecentSuccess
        ? "This camera has recent successful health checks."
        : "This camera is treated as live based on source reliability and current status."
    };
  }

  if (sourceClass === "seed") {
    return {
      isVerified: false,
      isReferenceOnly: true,
      sourceClass,
      label: "Reference only",
      summary: "This record came from seed/demo data and has not been verified as a working live feed yet."
    };
  }

  if (sourceClass === "community") {
    return {
      isVerified: false,
      isReferenceOnly: true,
      sourceClass,
      label: "Community pending verification",
      summary: "This submission exists in the index, but it has not passed enough checks to be shown as a live camera yet."
    };
  }

  return {
    isVerified: false,
    isReferenceOnly: true,
    sourceClass,
    label: "Awaiting verification",
    summary: "This camera record exists, but the app has not confirmed a recent working feed."
  };
}
