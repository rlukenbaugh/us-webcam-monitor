"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type PreviewItem = {
  row: {
    source_page: string;
    candidate_url: string;
    ok: string;
    status_code: string;
    content_type: string;
    stream_type: string;
  };
  candidate: {
    title: string;
    sourceUrl: string;
    embedUrl: string | null;
    imageUrl: string | null;
    latitude: number;
    longitude: number;
    stateCode: string | null;
    city: string | null;
    category: string;
    notes: string;
    status: string;
  } | null;
  skippedReason: string | null;
};

type ImportApiResponse = {
  mode: "dry-run" | "commit";
  totalRows: number;
  commitReady: number;
  skipped: number;
  inserted: number;
  duplicatesSkipped: number;
  preview: PreviewItem[];
};

type SeedPreviewItem = {
  row: {
    id: string;
    camera_name: string;
    latitude: number;
    longitude: number;
    country: string;
    state_or_region: string | null;
    city: string | null;
    category: string;
    stream_url: string | null;
    stream_type: string;
    source_website: string;
    status: string;
  };
  candidate: {
    title: string;
    sourceUrl: string;
    embedUrl: string | null;
    imageUrl: string | null;
    latitude: number;
    longitude: number;
    stateCode: string | null;
    city: string | null;
    category: string;
    notes: string;
    status: string;
  } | null;
  skippedReason: string | null;
};

type SeedImportApiResponse = {
  mode: "dry-run" | "commit";
  source: "upload" | "bundled";
  bundledDirectory: string | null;
  filesProcessed: number;
  totalRows: number;
  commitReady: number;
  skipped: number;
  inserted: number;
  duplicatesSkipped: number;
  bulkApproved: number;
  preview: SeedPreviewItem[];
};

type ValidatorPreviewItem = {
  row: {
    id: string;
    camera_name: string;
    latitude: number;
    longitude: number;
    country: string;
    state_or_region: string | null;
    city: string | null;
    category: string;
    stream_url: string | null;
    stream_type: string | null;
    image_url: string | null;
    source_website: string | null;
    status: string | null;
    validator: {
      ok: boolean | null;
      status_code: number | null;
      content_type: string | null;
      checked_at: string | null;
      response_ms: number | null;
    } | null;
  };
  candidate: {
    title: string;
    sourceUrl: string;
    embedUrl: string | null;
    imageUrl: string | null;
    latitude: number;
    longitude: number;
    stateCode: string | null;
    city: string | null;
    category: string;
    notes: string;
    status: string;
  } | null;
  skippedReason: string | null;
};

type ValidatorImportApiResponse = {
  mode: "dry-run" | "commit";
  filesProcessed: number;
  totalRows: number;
  commitReady: number;
  skipped: number;
  inserted: number;
  duplicatesSkipped: number;
  preview: ValidatorPreviewItem[];
};

type BulkPromoteApiResponse = {
  message: string;
  totalMatched: number;
  promoted: number;
  duplicatesSkipped: number;
  failed: number;
  promotedCameras: Array<{
    submissionId: string;
    slug: string;
    name: string;
  }>;
  failures: Array<{
    submissionId: string;
    title: string;
    reason: string;
  }>;
};

type SubmissionItem = {
  id: string;
  title: string;
  sourceUrl: string;
  embedUrl: string | null;
  imageUrl: string | null;
  latitude: number;
  longitude: number;
  stateCode: string | null;
  city: string | null;
  category: string;
  notes: string | null;
  status: string;
  moderationNotes: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  createdAt: string;
  updatedAt: string;
  source: {
    key: string;
    name: string;
    type: string;
  } | null;
  raw: unknown;
};

type SubmissionsApiResponse = {
  count: number;
  items: SubmissionItem[];
  summary: Record<string, number>;
};

const STATUS_FILTERS = [
  { label: "Needs Review", value: "needs_review" },
  { label: "Pending", value: "pending" },
  { label: "Approved (Live)", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "All", value: "all" }
];

export function WebcamFinderImporter() {
  const [file, setFile] = useState<File | null>(null);
  const [seedFiles, setSeedFiles] = useState<File[]>([]);
  const [validatorFiles, setValidatorFiles] = useState<File[]>([]);
  const [stateCode, setStateCode] = useState("");
  const [city, setCity] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [limit, setLimit] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isSeedImporting, setIsSeedImporting] = useState(false);
  const [isValidatorImporting, setIsValidatorImporting] = useState(false);
  const [isBulkReviewing, setIsBulkReviewing] = useState(false);
  const [isBulkPromoting, setIsBulkPromoting] = useState(false);
  const [isRunningFullSeedFlow, setIsRunningFullSeedFlow] = useState(false);
  const [importError, setImportError] = useState("");
  const [seedImportError, setSeedImportError] = useState("");
  const [validatorImportError, setValidatorImportError] = useState("");
  const [importResult, setImportResult] = useState<ImportApiResponse | null>(null);
  const [seedImportResult, setSeedImportResult] = useState<SeedImportApiResponse | null>(null);
  const [validatorImportResult, setValidatorImportResult] = useState<ValidatorImportApiResponse | null>(null);
  const [bulkPromoteResult, setBulkPromoteResult] = useState<BulkPromoteApiResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState("needs_review");
  const [submissions, setSubmissions] = useState<SubmissionsApiResponse | null>(null);
  const [queueError, setQueueError] = useState("");
  const [isQueueLoading, setIsQueueLoading] = useState(false);
  const [activeActionKey, setActiveActionKey] = useState("");
  const [promotionMessage, setPromotionMessage] = useState("");

  const fallbackReady = useMemo(
    () => lat.trim().length > 0 && lng.trim().length > 0,
    [lat, lng]
  );

  const loadSubmissions = useCallback(async () => {
    setIsQueueLoading(true);
    setQueueError("");

    try {
      const params = new URLSearchParams({
        status: statusFilter,
        limit: "50"
      });
      const response = await fetch(`/api/admin/submissions?${params.toString()}`, {
        cache: "no-store"
      });
      const payload = (await response.json()) as SubmissionsApiResponse & { message?: string; error?: string };

      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Unable to load submissions");
      }

      setSubmissions(payload);
    } catch (error) {
      setQueueError(error instanceof Error ? error.message : "Unable to load submissions");
    } finally {
      setIsQueueLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void loadSubmissions();
  }, [loadSubmissions]);

  async function runImport(commit: boolean) {
    if (!file) {
      setImportError("Choose a CSV file first.");
      return;
    }

    setIsImporting(true);
    setImportError("");
    setSeedImportError("");
    setPromotionMessage("");

    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("commit", String(commit));

      if (limit.trim()) {
        formData.set("limit", limit.trim());
      }
      if (stateCode.trim()) {
        formData.set("stateCode", stateCode.trim().toUpperCase());
      }
      if (city.trim()) {
        formData.set("city", city.trim());
      }
      if (lat.trim()) {
        formData.set("lat", lat.trim());
      }
      if (lng.trim()) {
        formData.set("lng", lng.trim());
      }

      const response = await fetch("/api/admin/webcam-finder-import", {
        method: "POST",
        body: formData
      });

      const payload = (await response.json()) as ImportApiResponse & { message?: string; error?: string };

      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Import failed");
      }

      setImportResult(payload);

      if (commit) {
        await loadSubmissions();
        setPromotionMessage(
          payload.inserted > 0
            ? `Imported ${payload.inserted} submission${payload.inserted === 1 ? "" : "s"} into the moderation queue.`
            : "No new submissions were inserted."
        );
      }
    } catch (nextError) {
      setImportError(nextError instanceof Error ? nextError.message : "Import failed");
    } finally {
      setIsImporting(false);
    }
  }

  async function runSeedImport(options: {
    commit: boolean;
    useBundled?: boolean;
    bulkApprove?: boolean;
  }) {
    if (!options.useBundled && seedFiles.length === 0) {
      setSeedImportError("Choose one or more JSON batch files first.");
      return;
    }

    setIsSeedImporting(true);
    setSeedImportError("");
    setImportError("");
    setPromotionMessage("");
    setBulkPromoteResult(null);

    try {
      const formData = new FormData();
      for (const seedFile of seedFiles) {
        formData.append("files", seedFile);
      }
      formData.set("commit", String(options.commit));
      formData.set("useBundled", String(Boolean(options.useBundled)));
      formData.set("bulkApprove", String(Boolean(options.bulkApprove)));

      if (!options.useBundled && limit.trim()) {
        formData.set("limit", limit.trim());
      }

      const response = await fetch("/api/admin/seed-import", {
        method: "POST",
        body: formData
      });

      const payload = (await response.json()) as SeedImportApiResponse & { message?: string; error?: string };

      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Seed import failed");
      }

      setSeedImportResult(payload);

      if (options.commit) {
        await loadSubmissions();
        if (payload.bulkApproved > 0) {
          setPromotionMessage(
            `Imported ${payload.inserted} seed submission${payload.inserted === 1 ? "" : "s"} and bulk approved ${payload.bulkApproved}.`
          );
        } else {
          setPromotionMessage(
            payload.inserted > 0
              ? `Imported ${payload.inserted} seed submission${payload.inserted === 1 ? "" : "s"} into the moderation queue.`
              : "No new seed submissions were inserted."
          );
        }
      }
    } catch (error) {
      setSeedImportError(error instanceof Error ? error.message : "Seed import failed");
    } finally {
      setIsSeedImporting(false);
    }
  }

  async function runValidatorImport(commit: boolean) {
    if (validatorFiles.length === 0) {
      setValidatorImportError("Choose one or more validator JSON files first.");
      return;
    }

    setIsValidatorImporting(true);
    setValidatorImportError("");
    setImportError("");
    setSeedImportError("");
    setPromotionMessage("");

    try {
      const formData = new FormData();
      for (const validatorFile of validatorFiles) {
        formData.append("files", validatorFile);
      }
      formData.set("commit", String(commit));

      if (limit.trim()) {
        formData.set("limit", limit.trim());
      }

      const response = await fetch("/api/admin/validator-import", {
        method: "POST",
        body: formData
      });

      const payload = (await response.json()) as ValidatorImportApiResponse & {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Validator import failed");
      }

      setValidatorImportResult(payload);

      if (commit) {
        await loadSubmissions();
        setPromotionMessage(
          payload.inserted > 0
            ? `Imported ${payload.inserted} validator-backed submission${payload.inserted === 1 ? "" : "s"} into the moderation queue.`
            : "No new validator-backed submissions were inserted."
        );
      }
    } catch (error) {
      setValidatorImportError(error instanceof Error ? error.message : "Validator import failed");
    } finally {
      setIsValidatorImporting(false);
    }
  }

  async function bulkReviewCurrentFilter(action: "approve" | "reject") {
    setIsBulkReviewing(true);
    setQueueError("");
    setPromotionMessage("");
    setBulkPromoteResult(null);

    try {
      const response = await fetch("/api/admin/submissions/bulk-review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action,
          status: statusFilter
        })
      });

      const payload = (await response.json()) as {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Bulk review failed");
      }

      setPromotionMessage(
        payload.message ??
          (action === "approve" ? "Bulk queueing completed." : "Bulk rejection completed.")
      );
      await loadSubmissions();
    } catch (error) {
      setQueueError(error instanceof Error ? error.message : "Bulk review failed");
    } finally {
      setIsBulkReviewing(false);
    }
  }

  async function bulkPromoteSubmissions(options?: {
    sourceKey?: string;
    status?: "pending" | "needs_review" | "approved" | "rejected";
  }) {
    setIsBulkPromoting(true);
    setQueueError("");
    setPromotionMessage("");
    setBulkPromoteResult(null);

    try {
      const response = await fetch("/api/admin/submissions/bulk-promote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...(options?.sourceKey ? { sourceKey: options.sourceKey } : {}),
          status: options?.status ?? "pending",
          limit: 20000
        })
      });

      const payload = (await response.json()) as BulkPromoteApiResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Bulk promote failed");
      }

      setBulkPromoteResult(payload);
      setPromotionMessage(payload.message);
      await loadSubmissions();
    } catch (error) {
      setQueueError(error instanceof Error ? error.message : "Bulk promote failed");
    } finally {
      setIsBulkPromoting(false);
    }
  }

  async function bulkPromotePendingSeedImports() {
    await bulkPromoteSubmissions({
      sourceKey: "seed-dataset-import",
      status: "pending"
    });
  }

  async function bulkPromotePendingQueue() {
    await bulkPromoteSubmissions({
      status: "pending"
    });
  }

  async function runFullSeedImportFlow() {
    setIsRunningFullSeedFlow(true);
    setSeedImportError("");
    setQueueError("");
    setImportError("");
    setPromotionMessage("");
    setBulkPromoteResult(null);

    try {
      const importFormData = new FormData();
      importFormData.set("commit", "true");
      importFormData.set("useBundled", "true");
      importFormData.set("bulkApprove", "true");

      const importResponse = await fetch("/api/admin/seed-import", {
        method: "POST",
        body: importFormData
      });

      const importPayload = (await importResponse.json()) as SeedImportApiResponse & {
        message?: string;
        error?: string;
      };

      if (!importResponse.ok) {
        throw new Error(importPayload.error || importPayload.message || "Seed import failed");
      }

      setSeedImportResult(importPayload);

      const promoteResponse = await fetch("/api/admin/submissions/bulk-promote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sourceKey: "seed-dataset-import",
          status: "pending",
          limit: 20000
        })
      });

      const promotePayload = (await promoteResponse.json()) as BulkPromoteApiResponse & {
        error?: string;
      };

      if (!promoteResponse.ok) {
        throw new Error(promotePayload.error || promotePayload.message || "Bulk promote failed");
      }

      setBulkPromoteResult(promotePayload);
      setPromotionMessage(
        `Imported ${importPayload.inserted}, bulk approved ${importPayload.bulkApproved}, promoted ${promotePayload.promoted}, skipped ${promotePayload.duplicatesSkipped} duplicates, failed ${promotePayload.failed}.`
      );
      await loadSubmissions();
    } catch (error) {
      setQueueError(error instanceof Error ? error.message : "Full seed flow failed");
    } finally {
      setIsRunningFullSeedFlow(false);
    }
  }

  async function promoteSubmission(submissionId: string) {
    setActiveActionKey(`promote:${submissionId}`);
    setQueueError("");
    setPromotionMessage("");

    try {
      const response = await fetch(`/api/admin/submissions/${submissionId}/promote`, {
        method: "POST"
      });
      const payload = (await response.json()) as {
        message?: string;
        error?: string;
        camera?: { slug: string; name: string };
      };

      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Promotion failed");
      }

      setPromotionMessage(
        payload.camera
          ? `Promoted "${payload.camera.name}" to live camera record (${payload.camera.slug}).`
          : "Submission promoted successfully."
      );
      await loadSubmissions();
    } catch (error) {
      setQueueError(error instanceof Error ? error.message : "Promotion failed");
    } finally {
      setActiveActionKey("");
    }
  }

  async function reviewSubmission(submissionId: string, action: "approve" | "reject") {
    setActiveActionKey(`${action}:${submissionId}`);
    setQueueError("");
    setPromotionMessage("");

    try {
      const response = await fetch(`/api/admin/submissions/${submissionId}/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action
        })
      });

      const payload = (await response.json()) as {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Review failed");
      }

      setPromotionMessage(
        payload.message ??
          (action === "approve" ? "Submission queued for later promotion." : "Submission rejected.")
      );
      await loadSubmissions();
    } catch (error) {
      setQueueError(error instanceof Error ? error.message : "Review failed");
    } finally {
      setActiveActionKey("");
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Webcam Finder CSV Import</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Upload CSV output from the fallback Python webcam finder, preview how rows will map into moderation,
          and optionally import commit-ready entries into the submissions queue as <code>NEEDS_REVIEW</code>.
        </p>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">CSV file</label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            />
            <p className="text-xs text-slate-500">
              Expected columns: <code>source_page</code>, <code>candidate_url</code>, <code>ok</code>, <code>status_code</code>, <code>content_type</code>, <code>stream_type</code>
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">State code</label>
              <input
                value={stateCode}
                onChange={(event) => setStateCode(event.target.value)}
                maxLength={2}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm uppercase"
                placeholder="MN"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">City</label>
              <input
                value={city}
                onChange={(event) => setCity(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                placeholder="Minneapolis"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Latitude</label>
              <input
                value={lat}
                onChange={(event) => setLat(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                placeholder="46.7296"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Longitude</label>
              <input
                value={lng}
                onChange={(event) => setLng(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                placeholder="-94.6859"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Row limit (optional)</label>
              <input
                value={limit}
                onChange={(event) => setLimit(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                placeholder="Leave blank for full import"
              />
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Fallback coordinates are optional but useful for area-specific crawls. If you import Minnesota DOT results with
          `MN` + rough state-center coordinates, rows without built-in hints can still enter moderation.
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void runImport(false)}
            disabled={isImporting || !file}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isImporting ? "Working..." : "Preview Import"}
          </button>
          <button
            type="button"
            onClick={() => void runImport(true)}
            disabled={isImporting || !file}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isImporting ? "Working..." : "Commit To Submissions"}
          </button>
        </div>

        {fallbackReady ? (
          <p className="mt-3 text-xs text-slate-500">
            Fallback location will be used for rows that have no domain or keyword-based location hint.
          </p>
        ) : null}

        {importError ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {importError}
          </div>
        ) : null}

        {promotionMessage ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {promotionMessage}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-900">Seed Dataset JSON Import</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Upload one or more JSON seed batch files and import them into moderation as <code>NEEDS_REVIEW</code>.
          This is the right path for the larger 10,000-record starter dataset.
        </p>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">JSON batch files</label>
            <input
              type="file"
              accept=".json,application/json"
              multiple
              onChange={(event) => setSeedFiles(Array.from(event.target.files ?? []))}
              className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            />
            <p className="text-xs text-slate-500">
              Select one or many files like <code>batch_01.json</code> through <code>batch_20.json</code>.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-medium text-slate-900">What this does</p>
            <p className="mt-2">
              Seed batch imports create moderation submissions, not live cameras. That keeps the demo data separate from
              verified feeds and gives you a clean review step before promotion.
            </p>
            <p className="mt-3 text-xs text-slate-500">
              Current selection: {seedFiles.length} file{seedFiles.length === 1 ? "" : "s"}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Bundled import uses the packaged 10,000-record seed set shipped with the desktop app and now ignores the row limit.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void runSeedImport({ commit: false })}
            disabled={isSeedImporting || seedFiles.length === 0}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSeedImporting ? "Working..." : "Preview Seed Import"}
          </button>
          <button
            type="button"
            onClick={() => void runSeedImport({ commit: true })}
            disabled={isSeedImporting || seedFiles.length === 0}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSeedImporting ? "Working..." : "Commit Seed Batches"}
          </button>
          <button
            type="button"
            onClick={() => void runSeedImport({ commit: true, useBundled: true })}
            disabled={isSeedImporting}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSeedImporting ? "Working..." : "Import All Bundled Batches"}
          </button>
          <button
            type="button"
            onClick={() => void runSeedImport({ commit: true, useBundled: true, bulkApprove: true })}
            disabled={isSeedImporting || isRunningFullSeedFlow}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSeedImporting ? "Working..." : "Import + Bulk Approve"}
          </button>
          <button
            type="button"
            onClick={() => void bulkPromotePendingSeedImports()}
            disabled={isBulkPromoting || isRunningFullSeedFlow}
            className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isBulkPromoting ? "Working..." : "Bulk Promote Pending Seed Imports"}
          </button>
          <button
            type="button"
            onClick={() => void runFullSeedImportFlow()}
            disabled={isRunningFullSeedFlow || isSeedImporting || isBulkPromoting}
            className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRunningFullSeedFlow ? "Working..." : "Import + Bulk Approve + Bulk Promote"}
          </button>
        </div>

        {seedImportError ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {seedImportError}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-900">Validator JSON Import</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Upload one or more validator-aware JSON files that include webcam metadata plus validation results. This path is ideal when you already have checked feeds and want to carry the health evidence into moderation.
        </p>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">Validator JSON files</label>
            <input
              type="file"
              accept=".json,application/json"
              multiple
              onChange={(event) => setValidatorFiles(Array.from(event.target.files ?? []))}
              className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            />
            <p className="text-xs text-slate-500">
              Current selection: {validatorFiles.length} file{validatorFiles.length === 1 ? "" : "s"}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-medium text-slate-900">Expected shape</p>
            <p className="mt-2">
              Each record should include webcam identity plus coordinates and source URLs. The validator block should look like:
              <code className="ml-1">{"validator: { ok, status_code, content_type, checked_at, response_ms }"}</code>.
            </p>
            <p className="mt-3 text-xs text-slate-500">
              Supported top-level payloads: a single webcam object, an array of objects, or an object containing <code>items</code>, <code>webcams</code>, <code>records</code>, or <code>data</code>.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void runValidatorImport(false)}
            disabled={isValidatorImporting || validatorFiles.length === 0}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isValidatorImporting ? "Working..." : "Preview Validator Import"}
          </button>
          <button
            type="button"
            onClick={() => void runValidatorImport(true)}
            disabled={isValidatorImporting || validatorFiles.length === 0}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isValidatorImporting ? "Working..." : "Commit Validator JSON"}
          </button>
        </div>

        {validatorImportError ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {validatorImportError}
          </div>
        ) : null}
      </section>

      {importResult ? (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap gap-3">
            <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
              <span className="font-semibold text-slate-900">{importResult.totalRows}</span> rows processed
            </div>
            <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <span className="font-semibold">{importResult.commitReady}</span> commit-ready
            </div>
            <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span className="font-semibold">{importResult.skipped}</span> skipped
            </div>
            <div className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
              <span className="font-semibold">{importResult.inserted}</span> inserted
            </div>
            <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
              <span className="font-semibold">{importResult.duplicatesSkipped}</span> duplicates skipped
            </div>
          </div>

          <div className="rounded-xl border border-slate-200">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Preview</h2>
              <p className="mt-1 text-xs text-slate-500">
                Showing up to the first 100 mapped rows from this upload.
              </p>
            </div>

            <div className="max-h-[34rem] overflow-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Candidate</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Mapped Submission</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Location</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {importResult.preview.map((item, index) => (
                    <tr key={`${item.row.candidate_url}-${index}`} className="align-top">
                      <td className="px-4 py-3 text-xs text-slate-600">
                        <p className="font-medium text-slate-900">{item.row.stream_type || "UNKNOWN"}</p>
                        <p className="mt-1 break-all">{item.row.candidate_url}</p>
                        <p className="mt-1 break-all text-slate-500">{item.row.source_page}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {item.candidate ? (
                          <>
                            <p className="font-medium text-slate-900">{item.candidate.title}</p>
                            <p className="mt-1">{item.candidate.category}</p>
                            <p className="mt-1 break-words text-slate-500">{item.candidate.notes}</p>
                          </>
                        ) : (
                          <span className="text-slate-400">No mapped submission</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {item.candidate ? (
                          <>
                            <p>
                              {item.candidate.city ?? "Unknown city"}
                              {item.candidate.stateCode ? `, ${item.candidate.stateCode}` : ""}
                            </p>
                            <p className="mt-1 text-slate-500">
                              {item.candidate.latitude.toFixed(4)}, {item.candidate.longitude.toFixed(4)}
                            </p>
                          </>
                        ) : (
                          <span className="text-slate-400">No location</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {item.skippedReason ? (
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800">
                            {item.skippedReason}
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-800">
                            Ready for moderation
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {seedImportResult ? (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap gap-3">
            <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
              <span className="font-semibold text-slate-900">{seedImportResult.filesProcessed}</span> files processed
            </div>
            <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
              <span className="font-semibold text-slate-900">{seedImportResult.totalRows}</span> rows processed
            </div>
            <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <span className="font-semibold">{seedImportResult.commitReady}</span> commit-ready
            </div>
            <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span className="font-semibold">{seedImportResult.skipped}</span> skipped
            </div>
            <div className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
              <span className="font-semibold">{seedImportResult.inserted}</span> inserted
            </div>
            <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
              <span className="font-semibold">{seedImportResult.duplicatesSkipped}</span> duplicates skipped
            </div>
            <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <span className="font-semibold">{seedImportResult.bulkApproved}</span> bulk approved
            </div>
          </div>

          {seedImportResult.source === "bundled" && seedImportResult.bundledDirectory ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Loaded from bundled directory: <code>{seedImportResult.bundledDirectory}</code>
            </div>
          ) : null}

          <div className="rounded-xl border border-slate-200">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Seed Preview</h2>
              <p className="mt-1 text-xs text-slate-500">
                Showing up to the first 100 mapped rows from the selected seed batch files.
              </p>
            </div>

            <div className="max-h-[34rem] overflow-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Seed Record</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Mapped Submission</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Location</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {seedImportResult.preview.map((item) => (
                    <tr key={item.row.id} className="align-top">
                      <td className="px-4 py-3 text-xs text-slate-600">
                        <p className="font-medium text-slate-900">{item.row.camera_name}</p>
                        <p className="mt-1 uppercase tracking-wide text-slate-500">{item.row.category}</p>
                        <p className="mt-1 break-all">{item.row.stream_url ?? "No stream URL"}</p>
                        <p className="mt-1 break-all text-slate-500">{item.row.source_website}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {item.candidate ? (
                          <>
                            <p className="font-medium text-slate-900">{item.candidate.title}</p>
                            <p className="mt-1">{item.candidate.category}</p>
                            <p className="mt-1 break-words text-slate-500">{item.candidate.notes}</p>
                          </>
                        ) : (
                          <span className="text-slate-400">No mapped submission</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        <p>
                          {item.row.city ?? "Unknown city"}
                          {item.row.state_or_region ? `, ${item.row.state_or_region}` : ""}
                        </p>
                        <p className="mt-1">{item.row.country}</p>
                        <p className="mt-1 text-slate-500">
                          {item.row.latitude.toFixed(4)}, {item.row.longitude.toFixed(4)}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {item.skippedReason ? (
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800">
                            {item.skippedReason}
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-800">
                            Ready for moderation
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {validatorImportResult ? (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap gap-3">
            <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
              <span className="font-semibold text-slate-900">{validatorImportResult.filesProcessed}</span> files processed
            </div>
            <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
              <span className="font-semibold text-slate-900">{validatorImportResult.totalRows}</span> rows processed
            </div>
            <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <span className="font-semibold">{validatorImportResult.commitReady}</span> commit-ready
            </div>
            <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span className="font-semibold">{validatorImportResult.skipped}</span> skipped
            </div>
            <div className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
              <span className="font-semibold">{validatorImportResult.inserted}</span> inserted
            </div>
            <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
              <span className="font-semibold">{validatorImportResult.duplicatesSkipped}</span> duplicates skipped
            </div>
          </div>

          <div className="rounded-xl border border-slate-200">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Validator Preview</h2>
              <p className="mt-1 text-xs text-slate-500">
                Showing up to the first 100 validator-backed webcam rows from this upload.
              </p>
            </div>

            <div className="max-h-[34rem] overflow-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Webcam</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Validator</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Mapped Submission</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {validatorImportResult.preview.map((item) => (
                    <tr key={item.row.id} className="align-top">
                      <td className="px-4 py-3 text-xs text-slate-600">
                        <p className="font-medium text-slate-900">{item.row.camera_name || "Untitled webcam"}</p>
                        <p className="mt-1 uppercase tracking-wide text-slate-500">{item.row.category}</p>
                        <p className="mt-1">{item.row.city ?? "Unknown city"}{item.row.state_or_region ? `, ${item.row.state_or_region}` : ""}</p>
                        <p className="mt-1 text-slate-500">
                          {item.row.latitude.toFixed(4)}, {item.row.longitude.toFixed(4)}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {item.row.validator ? (
                          <>
                            <p>OK: {item.row.validator.ok === null ? "unknown" : item.row.validator.ok ? "true" : "false"}</p>
                            <p className="mt-1">HTTP: {item.row.validator.status_code ?? "unknown"}</p>
                            <p className="mt-1 break-all">{item.row.validator.content_type ?? "Unknown content type"}</p>
                            <p className="mt-1 text-slate-500">
                              {item.row.validator.response_ms ?? "?"} ms · {item.row.validator.checked_at ?? "Unknown check time"}
                            </p>
                          </>
                        ) : (
                          <span className="text-slate-400">No validator block</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {item.candidate ? (
                          <>
                            <p className="font-medium text-slate-900">{item.candidate.title}</p>
                            <p className="mt-1">{item.candidate.category}</p>
                            <p className="mt-1 break-all">{item.candidate.sourceUrl}</p>
                          </>
                        ) : (
                          <span className="text-slate-400">No mapped submission</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {item.skippedReason ? (
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800">
                            {item.skippedReason}
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-800">
                            Ready for moderation
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {bulkPromoteResult ? (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap gap-3">
            <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
              <span className="font-semibold text-slate-900">{bulkPromoteResult.totalMatched}</span> matched
            </div>
            <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <span className="font-semibold">{bulkPromoteResult.promoted}</span> promoted
            </div>
            <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span className="font-semibold">{bulkPromoteResult.duplicatesSkipped}</span> duplicates skipped
            </div>
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
              <span className="font-semibold">{bulkPromoteResult.failed}</span> failed
            </div>
          </div>

          {bulkPromoteResult.promotedCameras.length > 0 ? (
            <div className="rounded-xl border border-slate-200">
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-900">Recently Promoted Cameras</h2>
              </div>
              <div className="max-h-80 overflow-auto divide-y divide-slate-100">
                {bulkPromoteResult.promotedCameras.slice(0, 50).map((camera) => (
                  <div key={camera.submissionId} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                    <span className="font-medium text-slate-900">{camera.name}</span>
                    <a href={`/camera/${camera.slug}`} className="text-slate-700 underline">
                      /camera/{camera.slug}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {bulkPromoteResult.failures.length > 0 ? (
            <div className="rounded-xl border border-slate-200">
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-900">Promotion Issues</h2>
              </div>
              <div className="max-h-80 overflow-auto divide-y divide-slate-100">
                {bulkPromoteResult.failures.slice(0, 50).map((failure) => (
                  <div key={failure.submissionId} className="px-4 py-3 text-sm">
                    <p className="font-medium text-slate-900">{failure.title}</p>
                    <p className="mt-1 text-slate-600">{failure.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Moderation Queue</h2>
            <p className="mt-1 text-sm text-slate-600">
              Review imported submissions and promote them into live camera records. Bulk promotion now requires a
              successful media health check first.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              <code>Pending</code> means queued for promotion. <code>Approved (Live)</code> means the submission has
              already been turned into a live camera record.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setStatusFilter(filter.value)}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  statusFilter === filter.value
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700"
                }`}
              >
                {filter.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void bulkReviewCurrentFilter("approve")}
              disabled={isBulkReviewing || statusFilter === "approved"}
              className="rounded-full border border-emerald-300 bg-white px-3 py-1.5 text-sm text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isBulkReviewing ? "Working..." : "Bulk Queue Current Filter"}
            </button>
            <button
              type="button"
              onClick={() => void bulkPromotePendingQueue()}
              disabled={isBulkPromoting}
              className="rounded-full bg-slate-900 px-3 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isBulkPromoting ? "Working..." : "Bulk Promote Pending Queue (Validated)"}
            </button>
          </div>
        </div>

        {submissions?.summary ? (
          <div className="mt-4 flex flex-wrap gap-3">
            {Object.entries(submissions.summary).map(([key, count]) => (
              <div key={key} className="rounded-xl bg-slate-100 px-4 py-2 text-sm text-slate-700">
                <span className="font-semibold text-slate-900">{count}</span> {key.replace(/_/g, " ")}
              </div>
            ))}
          </div>
        ) : null}

        {queueError ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {queueError}
          </div>
        ) : null}

        <div className="mt-5 rounded-xl border border-slate-200">
          <div className="border-b border-slate-200 px-4 py-3 text-sm text-slate-500">
            {isQueueLoading ? "Refreshing moderation queue..." : `${submissions?.count ?? 0} submission${(submissions?.count ?? 0) === 1 ? "" : "s"}`}
          </div>

          <div className="max-h-[40rem] overflow-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Submission</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Location</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Media</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {(submissions?.items ?? []).map((submission) => (
                  <tr key={submission.id} className="align-top">
                    <td className="px-4 py-3 text-xs text-slate-600">
                      <p className="font-medium text-slate-900">{submission.title}</p>
                      <p className="mt-1 uppercase tracking-wide text-slate-500">{submission.category}</p>
                      <p className="mt-1 break-all">{submission.sourceUrl}</p>
                      {submission.notes ? (
                        <p className="mt-2 text-slate-500">{submission.notes}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      <p>
                        {submission.city ?? "Unknown city"}
                        {submission.stateCode ? `, ${submission.stateCode}` : ""}
                      </p>
                      <p className="mt-1 text-slate-500">
                        {submission.latitude.toFixed(4)}, {submission.longitude.toFixed(4)}
                      </p>
                      <p className="mt-2 text-slate-500">Created {new Date(submission.createdAt).toLocaleString()}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {submission.embedUrl ? <p className="break-all">Embed: {submission.embedUrl}</p> : null}
                      {submission.imageUrl ? <p className="mt-1 break-all">Image: {submission.imageUrl}</p> : null}
                      {!submission.embedUrl && !submission.imageUrl ? (
                        <span className="text-slate-400">No media URL saved</span>
                      ) : null}
                      {submission.source ? (
                        <p className="mt-2 text-slate-500">{submission.source.name}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span
                        className={`rounded-full px-2.5 py-1 font-medium ${
                          submission.status === "approved"
                            ? "bg-emerald-100 text-emerald-800"
                            : submission.status === "rejected"
                              ? "bg-red-100 text-red-800"
                              : submission.status === "pending"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {submission.status.replace(/_/g, " ")}
                      </span>
                      {submission.moderationNotes ? (
                        <p className="mt-2 text-slate-500">{submission.moderationNotes}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {submission.status === "approved" ? (
                        <span className="text-slate-400">Already promoted</span>
                      ) : submission.status === "rejected" ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void reviewSubmission(submission.id, "approve")}
                            disabled={activeActionKey.length > 0}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {activeActionKey === `approve:${submission.id}` ? "Queueing..." : "Move To Pending"}
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {submission.status !== "pending" ? (
                            <button
                              type="button"
                              onClick={() => void reviewSubmission(submission.id, "approve")}
                              disabled={activeActionKey.length > 0}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {activeActionKey === `approve:${submission.id}` ? "Queueing..." : "Move To Pending"}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void reviewSubmission(submission.id, "reject")}
                            disabled={activeActionKey.length > 0}
                            className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {activeActionKey === `reject:${submission.id}` ? "Rejecting..." : "Reject"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void promoteSubmission(submission.id)}
                            disabled={activeActionKey.length > 0}
                            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {activeActionKey === `promote:${submission.id}` ? "Promoting..." : "Promote To Live Camera"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
