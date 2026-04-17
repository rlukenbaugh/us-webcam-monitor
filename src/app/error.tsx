"use client";

import { ButtonHTMLAttributes } from "react";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

function ActionButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-md px-4 py-2 text-sm font-medium ${props.className ?? ""}`.trim()}
    />
  );
}

export default function GlobalError({ error, reset }: Props) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-slate-100 p-6 text-slate-900">
        <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">Application Error</p>
          <h1 className="mt-2 text-2xl font-semibold">A client-side exception interrupted the webcam app.</h1>
          <p className="mt-3 text-sm text-slate-600">
            The local server started, but one of the browser-side components failed while rendering.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <ActionButton onClick={reset} className="bg-slate-900 text-white">
              Retry
            </ActionButton>
            <a
              href="/map"
              className="inline-flex items-center rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
            >
              Reload map
            </a>
          </div>

          <div className="mt-5 rounded-lg bg-slate-100 p-4 text-xs text-slate-700">
            <p className="font-semibold">Diagnostic detail</p>
            <p className="mt-1 break-all">{error.message || "Unknown client error"}</p>
            {error.digest ? <p className="mt-1 break-all">Digest: {error.digest}</p> : null}
          </div>
        </div>
      </body>
    </html>
  );
}
