import { Suspense } from "react";
import { SearchClient } from "@/components/search/search-client";

export default function SearchPage() {
  return (
    <main className="min-h-[calc(100vh-3.75rem)] bg-slate-100 px-4 py-6">
      <div className="mx-auto max-w-6xl">
        <Suspense
          fallback={
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm text-slate-600">Loading search tools...</p>
            </div>
          }
        >
          <SearchClient />
        </Suspense>
      </div>
    </main>
  );
}
