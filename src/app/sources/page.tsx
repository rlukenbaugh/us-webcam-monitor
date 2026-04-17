import { RunStatus, SourceStatus } from "@prisma/client";
import { SourcesPageClient, type SourceCardData } from "@/components/sources/sources-page-client";
import { registeredAdapters } from "@/lib/adapters";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

function badgeClass(status: string) {
  switch (status) {
    case SourceStatus.ACTIVE:
    case RunStatus.SUCCESS:
      return "bg-emerald-100 text-emerald-800";
    case SourceStatus.ERROR:
    case RunStatus.FAILED:
      return "bg-red-100 text-red-800";
    case RunStatus.PARTIAL:
      return "bg-amber-100 text-amber-800";
    case RunStatus.RUNNING:
      return "bg-blue-100 text-blue-800";
    default:
      return "bg-slate-200 text-slate-700";
  }
}

export default async function SourcesPage() {
  const adapterKeys = new Set(registeredAdapters.map((adapter) => adapter.key));
  const sources = await prisma.source.findMany({
    orderBy: [{ type: "asc" }, { name: "asc" }],
    include: {
      runs: {
        orderBy: { startedAt: "desc" },
        take: 1
      },
      _count: {
        select: {
          cameras: true,
          submissions: true
        }
      }
    }
  });

  const initialSources: SourceCardData[] = sources.map((source) => {
    const latestRun = source.runs[0] ?? null;

    return {
      id: source.id,
      key: source.key,
      name: source.name,
      type: source.type.toLowerCase(),
      attribution: source.attribution,
      baseUrl: source.baseUrl,
      syncCron: source.syncCron,
      status: source.status.toLowerCase(),
      isEnabled: source.isEnabled,
      lastRunAt: source.lastRunAt?.toISOString() ?? null,
      counts: {
        cameras: source._count.cameras,
        submissions: source._count.submissions
      },
      hasAdapter: adapterKeys.has(source.key),
      latestRun: latestRun
        ? {
            status: latestRun.status.toLowerCase(),
            startedAt: latestRun.startedAt.toISOString(),
            endedAt: latestRun.endedAt?.toISOString() ?? null,
            fetchedCount: latestRun.fetchedCount,
            normalizedCount: latestRun.normalizedCount,
            insertedCount: latestRun.insertedCount,
            updatedCount: latestRun.updatedCount,
            failedCount: latestRun.failedCount,
            duplicateCount: latestRun.duplicateCount,
            errorSummary: latestRun.errorSummary
          }
        : null,
      badgeClassName: badgeClass(source.status)
    };
  });

  return (
    <main className="min-h-[calc(100vh-3.75rem)] bg-slate-100 px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">Sources</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Track connector health, source coverage, and the last import run for every upstream feed currently known to
            the app. You can also rerun a source or temporarily disable it when a feed starts misbehaving.
          </p>
        </section>

        <SourcesPageClient initialSources={initialSources} />
      </div>
    </main>
  );
}
