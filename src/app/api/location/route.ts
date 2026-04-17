import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ApproximateLocationResult = {
  lat: number;
  lng: number;
  city: string | null;
  region: string | null;
  countryCode: string | null;
  source: string;
};

type FreeIpApiResponse = {
  latitude?: number;
  longitude?: number;
  cityName?: string;
  regionName?: string;
  countryCode?: string;
};

type IpInfoResponse = {
  city?: string;
  region?: string;
  country?: string;
  loc?: string;
};

type IfConfigResponse = {
  latitude?: number;
  longitude?: number;
  city?: string;
  region_code?: string;
  country_iso?: string;
};

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "User-Agent": "us-webcam-monitor/0.1"
    }
  });

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  return response.json();
}

function fromFreeIpApi(payload: unknown): ApproximateLocationResult | null {
  const value = payload as FreeIpApiResponse;

  if (typeof value.latitude !== "number" || typeof value.longitude !== "number") {
    return null;
  }

  return {
    lat: value.latitude,
    lng: value.longitude,
    city: value.cityName ?? null,
    region: value.regionName ?? null,
    countryCode: value.countryCode ?? null,
    source: "freeipapi.com"
  };
}

function fromIpInfo(payload: unknown): ApproximateLocationResult | null {
  const value = payload as IpInfoResponse;

  if (!value.loc || typeof value.loc !== "string") {
    return null;
  }

  const [latText, lngText] = value.loc.split(",");
  const lat = Number(latText);
  const lng = Number(lngText);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return {
    lat,
    lng,
    city: value.city ?? null,
    region: value.region ?? null,
    countryCode: value.country ?? null,
    source: "ipinfo.io"
  };
}

function fromIfConfig(payload: unknown): ApproximateLocationResult | null {
  const value = payload as IfConfigResponse;

  if (typeof value.latitude !== "number" || typeof value.longitude !== "number") {
    return null;
  }

  return {
    lat: value.latitude,
    lng: value.longitude,
    city: value.city ?? null,
    region: value.region_code ?? null,
    countryCode: value.country_iso ?? null,
    source: "ifconfig.co"
  };
}

const providers: Array<{
  url: string;
  parse: (payload: unknown) => ApproximateLocationResult | null;
}> = [
  {
    url: "https://freeipapi.com/api/json",
    parse: fromFreeIpApi
  },
  {
    url: "https://ipinfo.io/json",
    parse: fromIpInfo
  },
  {
    url: "https://ifconfig.co/json",
    parse: fromIfConfig
  }
];

export async function GET() {
  const errors: string[] = [];

  for (const provider of providers) {
    try {
      const payload = await fetchJson(provider.url);
      const location = provider.parse(payload);

      if (!location) {
        throw new Error("Provider returned invalid coordinates");
      }

      return NextResponse.json(location);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown provider error");
    }
  }

  return NextResponse.json(
    {
      message: "Failed to estimate location",
      error: errors.join("; ")
    },
    { status: 502 }
  );
}
