import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CameraStatus } from "@prisma/client";
import { CameraMediaPlayer } from "@/components/camera/camera-media-player";
import { FavoriteCameraButton } from "@/components/camera/favorite-camera-button";
import { ReportBrokenButton } from "@/components/camera/report-broken-button";
import { deriveCameraVerification } from "@/lib/cameras/verification";
import { prisma } from "@/lib/db/prisma";

type PageContext = {
  params: Promise<{
    slug: string;
  }>;
};

function formatStatus(status: CameraStatus) {
  return status.toLowerCase();
}

function statusClass(status: CameraStatus) {
  switch (status) {
    case CameraStatus.ONLINE:
      return "bg-emerald-100 text-emerald-800";
    case CameraStatus.OFFLINE:
      return "bg-red-100 text-red-800";
    default:
      return "bg-slate-200 text-slate-700";
  }
}

function verificationBadgeClass(sourceClass: "official" | "community" | "seed", isVerified: boolean) {
  if (isVerified) {
    return "bg-emerald-100 text-emerald-800";
  }

  if (sourceClass === "seed") {
    return "bg-amber-100 text-amber-900";
  }

  if (sourceClass === "community") {
    return "bg-blue-100 text-blue-800";
  }

  return "bg-slate-200 text-slate-700";
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number) {
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const lat1 = toRadians(aLat);
  const lat2 = toRadians(bLat);
  const arc =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * earthRadiusMiles * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

async function getCamera(slug: string) {
  return prisma.camera.findUnique({
    where: { slug },
    include: {
      source: true,
      streams: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }]
      },
      images: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }]
      },
      tags: {
        include: {
          tag: true
        }
      }
    }
  });
}

async function getNearbyCameras(slug: string, latitude: number, longitude: number, stateCode: string | null) {
  const latitudeRange = 1.2;
  const longitudeRange = 1.2;

  const nearby = await prisma.camera.findMany({
    where: {
      slug: {
        not: slug
      },
      isEnabled: true,
      ...(stateCode ? { stateCode } : {}),
      latitude: {
        gte: latitude - latitudeRange,
        lte: latitude + latitudeRange
      },
      longitude: {
        gte: longitude - longitudeRange,
        lte: longitude + longitudeRange
      }
    },
    select: {
      id: true,
      slug: true,
      name: true,
      city: true,
      stateCode: true,
      latitude: true,
      longitude: true,
      category: true,
      status: true
    },
    take: 12
  });

  return nearby
    .map((camera) => ({
      ...camera,
      distanceMiles: haversineMiles(latitude, longitude, camera.latitude, camera.longitude)
    }))
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, 6);
}

export async function generateMetadata({ params }: PageContext): Promise<Metadata> {
  const resolvedParams = await params;
  const camera = await prisma.camera.findUnique({
    where: { slug: resolvedParams.slug },
    select: {
      name: true,
      city: true,
      stateCode: true,
      description: true
    }
  });

  if (!camera) {
    return {
      title: "Camera Not Found | US Webcam Monitor"
    };
  }

  return {
    title: `${camera.name} | US Webcam Monitor`,
    description:
      camera.description ??
      `${camera.name}${camera.city ? ` in ${camera.city}` : ""}${camera.stateCode ? `, ${camera.stateCode}` : ""}`
  };
}

export default async function CameraDetailPage({ params }: PageContext) {
  const resolvedParams = await params;
  const camera = await getCamera(resolvedParams.slug);

  if (!camera) {
    notFound();
  }

  const primaryStream = camera.streams[0];
  const primaryImage = camera.images[0];
  const verification = deriveCameraVerification({
    sourceKey: camera.source.key,
    sourceType: camera.source.type,
    status: camera.status,
    confidenceScore: camera.confidenceScore,
    lastCheckedAt: camera.lastCheckedAt,
    lastSuccessAt: camera.lastSuccessAt,
    raw: camera.raw
  });
  const nearby = await getNearbyCameras(
    camera.slug,
    camera.latitude,
    camera.longitude,
    camera.stateCode
  );

  return (
    <main className="min-h-[calc(100vh-3.75rem)] bg-slate-100 px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(camera.status)}`}>
                {formatStatus(camera.status)}
              </span>
              <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700">
                {camera.category.toLowerCase()}
              </span>
              <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700">
                confidence {camera.confidenceScore.toFixed(2)}
              </span>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${verificationBadgeClass(
                  verification.sourceClass,
                  verification.isVerified
                )}`}
              >
                {verification.label}
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold text-slate-900">{camera.name}</h1>
            <p className="mt-2 text-sm text-slate-600">
              {camera.city ?? "Unknown city"}
              {camera.stateCode ? `, ${camera.stateCode}` : ""} • {camera.source.name}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <FavoriteCameraButton cameraId={camera.id} />
            <Link
              href="/map"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
            >
              Back To Map
            </Link>
            <ReportBrokenButton slug={camera.slug} />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
          <section className="space-y-6">
            {!verification.isVerified ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 shadow-sm">
                <p className="font-semibold">{verification.label}</p>
                <p className="mt-1">{verification.summary}</p>
              </div>
            ) : null}

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              {verification.isVerified ? (
                <CameraMediaPlayer
                  name={camera.name}
                  stream={
                    primaryStream
                      ? {
                          url: primaryStream.url,
                          type: primaryStream.type.toLowerCase() as
                            | "hls"
                            | "mjpeg"
                            | "jpeg"
                            | "iframe"
                            | "youtube"
                            | "unknown",
                          isEmbeddable: primaryStream.isEmbeddable
                        }
                      : undefined
                  }
                  image={primaryImage ? { url: primaryImage.url } : undefined}
                />
              ) : (
                <div className="flex h-[26rem] flex-col items-center justify-center rounded-2xl border border-dashed border-amber-300 bg-amber-50 px-6 text-center">
                  <p className="text-base font-semibold text-amber-950">Preview hidden until this feed is verified</p>
                  <p className="mt-2 max-w-xl text-sm text-amber-900">
                    This camera stays in the index for reference, but the app will not present it as a live webcam until it
                    has passed recent health checks.
                  </p>
                  {camera.pageUrl ? (
                    <a
                      href={camera.pageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 rounded-xl bg-amber-900 px-4 py-2 text-sm font-medium text-white"
                    >
                      Open Source Page
                    </a>
                  ) : null}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Camera Details</h2>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Location</dt>
                  <dd className="mt-1 text-sm text-slate-700">
                    {camera.city ?? "Unknown city"}
                    {camera.stateCode ? `, ${camera.stateCode}` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Coordinates</dt>
                  <dd className="mt-1 text-sm text-slate-700">
                    {camera.latitude.toFixed(5)}, {camera.longitude.toFixed(5)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Source Type</dt>
                  <dd className="mt-1 text-sm text-slate-700">{camera.source.type.toLowerCase()}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Verification</dt>
                  <dd className="mt-1 text-sm text-slate-700">{verification.label}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last Checked</dt>
                  <dd className="mt-1 text-sm text-slate-700">
                    {camera.lastCheckedAt ? new Date(camera.lastCheckedAt).toLocaleString() : "Not checked yet"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last Success</dt>
                  <dd className="mt-1 text-sm text-slate-700">
                    {camera.lastSuccessAt ? new Date(camera.lastSuccessAt).toLocaleString() : "Unknown"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Provider</dt>
                  <dd className="mt-1 text-sm text-slate-700">
                    {camera.providerUrl ? (
                      <a href={camera.providerUrl} target="_blank" rel="noreferrer" className="text-slate-900 underline">
                        {camera.providerUrl}
                      </a>
                    ) : (
                      "Unknown"
                    )}
                  </dd>
                </div>
              </dl>

              {camera.description ? (
                <div className="mt-5 border-t border-slate-200 pt-5">
                  <h3 className="text-sm font-semibold text-slate-900">Notes</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{camera.description}</p>
                </div>
              ) : null}

              <div className="mt-5 border-t border-slate-200 pt-5">
                <h3 className="text-sm font-semibold text-slate-900">Tags</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {camera.tags.length > 0 ? (
                    camera.tags.map((cameraTag) => (
                      <span
                        key={cameraTag.tagId}
                        className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
                      >
                        {cameraTag.tag.name}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500">No tags assigned.</span>
                  )}
                </div>
              </div>
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Feed Links</h2>
              <div className="mt-4 space-y-3 text-sm">
                {camera.pageUrl ? (
                  <a href={camera.pageUrl} target="_blank" rel="noreferrer" className="block break-all text-slate-900 underline">
                    Source page
                  </a>
                ) : null}
                {primaryStream ? (
                  <a href={primaryStream.url} target="_blank" rel="noreferrer" className="block break-all text-slate-900 underline">
                    Stream URL ({primaryStream.type.toLowerCase()})
                  </a>
                ) : null}
                {primaryImage ? (
                  <a href={primaryImage.url} target="_blank" rel="noreferrer" className="block break-all text-slate-900 underline">
                    Image URL
                  </a>
                ) : null}
                {!camera.pageUrl && !primaryStream && !primaryImage ? (
                  <p className="text-slate-500">No external links are currently stored for this camera.</p>
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Nearby Cameras</h2>
              <ul className="mt-4 space-y-3">
                {nearby.length > 0 ? (
                  nearby.map((item) => (
                    <li key={item.id} className="rounded-xl border border-slate-200 p-3">
                      <Link href={`/camera/${item.slug}`} className="text-sm font-medium text-slate-900 hover:underline">
                        {item.name}
                      </Link>
                      <p className="mt-1 text-xs text-slate-600">
                        {item.city ?? "Unknown city"}
                        {item.stateCode ? `, ${item.stateCode}` : ""} • {item.category.toLowerCase()}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.distanceMiles.toFixed(1)} mi • {item.status.toLowerCase()}
                      </p>
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-slate-500">No nearby cameras were found in the current dataset.</li>
                )}
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
