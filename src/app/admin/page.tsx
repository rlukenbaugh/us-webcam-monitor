import { WebcamFinderImporter } from "@/components/admin/webcam-finder-importer";

export default function AdminPage() {
  return (
    <main className="min-h-[calc(100vh-3.75rem)] bg-slate-100 px-4 py-6">
      <div className="mx-auto max-w-6xl">
        <WebcamFinderImporter />
      </div>
    </main>
  );
}
