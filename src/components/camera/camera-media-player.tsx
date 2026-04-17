"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import Hls from "hls.js";

type StreamKind = "hls" | "mjpeg" | "jpeg" | "iframe" | "youtube" | "unknown";

type MediaPlayerProps = {
  name: string;
  stream:
    | {
        url: string;
        type: StreamKind;
        isEmbeddable: boolean;
      }
    | undefined;
  image:
    | {
        url: string;
      }
    | undefined;
};

export function CameraMediaPlayer({ name, stream, image }: MediaPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hlsError, setHlsError] = useState<string | null>(null);

  const canRenderIframe = useMemo(
    () => stream?.type === "iframe" || stream?.type === "youtube",
    [stream?.type]
  );

  const canRenderImage = useMemo(() => {
    return (
      stream?.type === "mjpeg" ||
      stream?.type === "jpeg" ||
      Boolean(image?.url)
    );
  }, [image?.url, stream?.type]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream?.url || stream.type !== "hls") {
      return;
    }

    setHlsError(null);

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = stream.url;
      return;
    }

    if (!Hls.isSupported()) {
      setHlsError("This desktop runtime cannot play this HLS stream inline.");
      return;
    }

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true
    });

    hls.loadSource(stream.url);
    hls.attachMedia(video);
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (data.fatal) {
        setHlsError("This HLS feed could not be played inline.");
        hls.destroy();
      }
    });

    return () => {
      hls.destroy();
    };
  }, [stream?.type, stream?.url]);

  if (canRenderIframe && stream?.url) {
    return (
      <iframe
        src={stream.url}
        title={name}
        className="h-[26rem] w-full rounded-2xl border border-slate-200 bg-slate-100"
        loading="lazy"
        allow="autoplay; fullscreen"
      />
    );
  }

  if (stream?.type === "hls" && stream.url) {
    return (
      <div className="space-y-3">
        <video
          ref={videoRef}
          className="h-[26rem] w-full rounded-2xl border border-slate-200 bg-black"
          controls
          autoPlay
          muted
          playsInline
        />
        {hlsError ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {hlsError}
          </div>
        ) : null}
      </div>
    );
  }

  if (canRenderImage) {
    const imageUrl = stream?.type === "mjpeg" || stream?.type === "jpeg" ? stream.url : image?.url;
    return (
      <div className="relative h-[26rem] w-full overflow-hidden rounded-2xl border border-slate-200">
        <Image
          src={imageUrl ?? ""}
          alt={name}
          fill
          unoptimized
          className="object-cover"
          sizes="(max-width: 1024px) 100vw, 960px"
        />
      </div>
    );
  }

  if (stream?.url) {
    return (
      <div className="flex h-[26rem] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
        <p className="text-base font-medium text-slate-900">Direct stream available</p>
        <p className="mt-2 max-w-lg text-sm text-slate-600">
          This feed uses a stream type that may not render inline in every desktop runtime. Open it directly below.
        </p>
        <a
          href={stream.url}
          target="_blank"
          rel="noreferrer"
          className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          Open Stream URL
        </a>
      </div>
    );
  }

  return (
    <div className="flex h-[26rem] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
      No preview media is currently available for this camera.
    </div>
  );
}
