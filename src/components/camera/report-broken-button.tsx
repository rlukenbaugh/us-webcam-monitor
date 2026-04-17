"use client";

import { useState } from "react";

export function ReportBrokenButton({ slug }: { slug: string }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleReport() {
    setIsSubmitting(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/cameras/${slug}/report`, {
        method: "POST"
      });

      const payload = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Unable to report camera");
      }

      setMessage(payload.message || "Report submitted.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to report camera");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void handleReport()}
        disabled={isSubmitting}
        className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Submitting..." : "Report Broken Feed"}
      </button>
      {message ? (
        <p className="text-xs text-emerald-700">{message}</p>
      ) : null}
      {error ? (
        <p className="text-xs text-red-700">{error}</p>
      ) : null}
    </div>
  );
}
