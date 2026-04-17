"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type SourceCardData = {
  id: string;
  key: string;
  name: string;
  type: string;
  attribution: string | null;
  baseUrl: string | null;
  syncCron: string | null;
  status: string;
  isEnabled: boolean;
  lastRunAt: string | null;
  counts: {
    cameras: number;
    submissions: number;
  };
  hasAdapter: boolean;
  latestRun: {
    status: string;
    startedAt: string;
    endedAt: string | null;
    fetchedCount: number;
    normalizedCount: number;
    insertedCount: number;
    updatedCount: number;
    failedCount: number;
    duplicateCount: number;
    errorSummary: string | null;
  } | null;
  badgeClassName: string;
};

function badgeClass(status: string) {
  switch (status) {
    case "active":
    case "success":
      return "bg-emerald-100 text-emerald-800";
    case "error":
    case "failed":
      return "bg-red-100 text-red-800";
    case "partial":
      return "bg-amber-100 text-amber-800";
    case "running":
      return "bg-blue-100 text-blue-800";
    default:
      return "bg-slate-200 text-slate-700";
  }
}

type SourceActionResponse = {
  message?: string;
  error?: string;
};

export function SourcesPageClient({ initialSources }: { initialSources: SourceCardData[] }) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState("");
  const [feedback, setFeedback] = useState<Record<string, { kind: "success" | "error"; message: string }>>({});

  const sortedSources = useMemo(
    () => [...initialSources].sort((left, right) => left.name.localeCompare(right.name)),
    [initialSources]
  );

  async function mutateSource(sourceId: string, action: "enable" | "disable" | "rerun") {
    const key = `${action}:${sourceId}`;
    setBusyKey(key);
    setFeedback((current) => {
      const next = { ...current };
      delete next[sourceId];
      return next;
    });

    try {
      const response =
        action === "rerun"
          ? await fetch(`/api/admin/sources/${sourceId}/rerun`, { method: "POST" })
          : await fetch(`/api/admin/sources/${sourceId}/status`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ isEnabled: action === "enable" })
            });

      const payload = (await response.json()) as SourceActionResponse;
      if (!response.ok) {
        throw new Error(payload.error || payload.message || `Unable to ${action} source`);
      }

      setFeedback((current) => ({
        ...current,
        [sourceId]: {
          kind: "success",
          message:
            payload.message ??
            (action === "rerun"
              ? "Source sync started successfully."
              : action === "enable"
                ? "Source enabled."
                : "Source disabled.")
        }
      }));

      router.refresh();
    } catch (error) {
      setFeedback((current) => ({
        ...current,
        [sourceId]: {
          kind: "error",
          message: error instanceof Error ? error.message : `Unable to ${action} source`
        }
      }));
    } finally {
      setBusyKey("");
    }
  }

  return (
    <section className="grid gap-4">
      {sortedSources.map((source) => {
        const latestRun = source.latestRun;
        const sourceFeedback = feedback[source.id];

        return (
          <article key={source.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badgeClass(source.status)}`}>
                    {source.status}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                    {source.type}
                  </span>
                  {source.hasAdapter ? (
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                      adapter ready
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700">
                      no adapter
                    </span>
                  )}
                  {!source.isEnabled ? (
                    <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700">
                      disabled
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-3 text-xl font-semibold text-slate-900">{source.name}</h2>
                <p className="mt-1 text-sm text-slate-600">{source.key}</p>
                {source.attribution ? <p className="mt-3 text-sm text-slate-500">{source.attribution}</p> : null}
              </div>

              <div className="grid gap-2 text-sm text-slate-600 sm:text-right">
                <p>
                  <span className="font-medium text-slate-900">{source.counts.cameras}</span> live cameras
                </p>
                <p>
                  <span className="font-medium text-slate-900">{source.counts.submissions}</span> submissions
                </p>
                <p>
                  Last source run:{" "}
                  <span className="text-slate-900">
                    {source.lastRunAt ? new Date(source.lastRunAt).toLocaleString() : "Never"}
                  </span>
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void mutateSource(source.id, "rerun")}
                disabled={!source.hasAdapter || busyKey.length > 0}
                className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyKey === `rerun:${source.id}` ? "Running..." : "Rerun Source"}
              </button>
              <button
                type="button"
                onClick={() => void mutateSource(source.id, source.isEnabled ? "disable" : "enable")}
                disabled={busyKey.length > 0}
                className={`rounded-full border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${
                  source.isEnabled
                    ? "border-red-300 bg-white text-red-700"
                    : "border-emerald-300 bg-white text-emerald-700"
                }`}
              >
                {busyKey === `disable:${source.id}`
                  ? "Disabling..."
                  : busyKey === `enable:${source.id}`
                    ? "Enabling..."
                    : source.isEnabled
                      ? "Disable Source"
                      : "Enable Source"}
              </button>
            </div>

            {sourceFeedback ? (
              <div
                className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
                  sourceFeedback.kind === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {sourceFeedback.message}
              </div>
            ) : null}

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Base URL</p>
                <p className="mt-2 break-all text-sm text-slate-700">{source.baseUrl ?? "Not set"}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sync schedule</p>
                <p className="mt-2 text-sm text-slate-700">{source.syncCron ?? "Manual or ad hoc"}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Latest run status</p>
                {latestRun ? (
                  <>
                    <p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${badgeClass(latestRun.status)}`}>
                      {latestRun.status}
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      {new Date(latestRun.startedAt).toLocaleString()}
                      {latestRun.endedAt ? ` to ${new Date(latestRun.endedAt).toLocaleTimeString()}` : ""}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-slate-700">No source runs recorded yet.</p>
                )}
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Latest run totals</p>
                {latestRun ? (
                  <dl className="mt-2 space-y-1 text-sm text-slate-700">
                    <div>Fetched: {latestRun.fetchedCount}</div>
                    <div>Normalized: {latestRun.normalizedCount}</div>
                    <div>Inserted: {latestRun.insertedCount}</div>
                    <div>Updated: {latestRun.updatedCount}</div>
                    <div>Failed: {latestRun.failedCount}</div>
                    <div>Duplicates: {latestRun.duplicateCount}</div>
                  </dl>
                ) : (
                  <p className="mt-2 text-sm text-slate-700">No run metrics yet.</p>
                )}
              </div>
            </div>

            {latestRun?.errorSummary ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {latestRun.errorSummary}
              </div>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}
