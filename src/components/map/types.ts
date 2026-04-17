export type CameraListItem = {
  id: string;
  slug: string;
  name: string;
  category: string;
  status: "online" | "offline" | "unknown";
  confidenceScore: number;
  stateCode: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
  source: {
    key: string;
    name: string;
    type: string;
  };
  stream: {
    type: string;
    url: string;
    isEmbeddable: boolean;
  } | null;
  image: {
    url: string;
  } | null;
  lastCheckedAt: string | null;
  verification: {
    isVerified: boolean;
    isReferenceOnly: boolean;
    sourceClass: "official" | "community" | "seed";
    label: string;
    summary: string;
  };
};

export type CamerasApiResponse = {
  items: CameraListItem[];
  hasMore: boolean;
  count: number;
  filterMeta: {
    sourceTypes: string[];
    streamTypes: string[];
  };
};

export type NearMeCameraItem = CameraListItem & {
  distanceMiles: number;
};

export type NearMeApiResponse = {
  center: {
    lat: number;
    lng: number;
    radiusMiles: number;
  };
  fallbackToNearest?: boolean;
  count: number;
  items: NearMeCameraItem[];
};

export type ApproximateLocationApiResponse = {
  lat: number;
  lng: number;
  city: string | null;
  region: string | null;
  countryCode: string | null;
  source: string;
};

export type ManualLocationApiResponse = {
  lat: number;
  lng: number;
  matchedAddress: string;
  region: string | null;
  source: string;
  query: string;
};

export type TrendingCameraItem = {
  id: string;
  slug: string;
  name: string;
  category: string;
  status: "online" | "offline" | "unknown";
  stateCode: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
  source: {
    key: string;
    name: string;
    type: string;
  };
  verification: {
    isVerified: boolean;
    isReferenceOnly: boolean;
    sourceClass: "official" | "community" | "seed";
    label: string;
    summary: string;
  };
  stats: {
    favorites7d: number;
    successfulChecks24h: number;
    confidenceScore: number;
    trendingScore: number;
  };
};

export type TrendingApiResponse = {
  count: number;
  items: TrendingCameraItem[];
  windows: {
    favoritesDays: number;
    checksHours: number;
  };
};

export type StormAlertFeature = {
  type: "Feature";
  id: string;
  geometry: {
    type: string;
    coordinates: unknown;
  };
  properties: {
    id: string;
    event: string | null;
    severity: string | null;
    certainty: string | null;
    urgency: string | null;
    areaDesc: string | null;
    headline: string | null;
    sent: string | null;
    ends: string | null;
    senderName: string | null;
    instruction: string | null;
    web: string | null;
  };
};

export type StormAlertsApiResponse = {
  type: "FeatureCollection";
  features: StormAlertFeature[];
  count: number;
  source: string;
};
