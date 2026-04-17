export type SourceTypeNormalized = "dot" | "weather" | "tourism" | "manual";

export type StreamTypeNormalized =
  | "hls"
  | "mjpeg"
  | "jpeg"
  | "iframe"
  | "youtube"
  | "unknown";

export type CameraStatusNormalized = "online" | "offline" | "unknown";

export type CameraCategoryNormalized =
  | "traffic"
  | "weather"
  | "aviation"
  | "beach"
  | "tourism"
  | "downtown"
  | "mountain"
  | "park"
  | "harbor"
  | "ski"
  | "other";

export type NormalizedCameraRecord = {
  externalId: string | null;
  sourceId: string;
  sourceType: SourceTypeNormalized;
  name: string;
  slug: string;
  category: CameraCategoryNormalized;
  description: string | null;
  countryCode: "US";
  stateCode: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
  streamType: StreamTypeNormalized;
  streamUrl: string | null;
  imageUrl: string | null;
  pageUrl: string | null;
  providerUrl: string | null;
  status: CameraStatusNormalized;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  confidenceScore: number;
  tags: string[];
  raw: Record<string, unknown>;
};

export type AdapterContext = {
  sourceKey: string;
  sourceId: string;
  sourceName: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: Date;
};

export type AdapterRunResult = {
  fetchedCount: number;
  normalized: NormalizedCameraRecord[];
  errors: string[];
};

export interface SourceAdapter {
  readonly key: string;
  readonly sourceType: SourceTypeNormalized;
  run(context: AdapterContext): Promise<AdapterRunResult>;
}
