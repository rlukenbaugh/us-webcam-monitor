import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

type Geometry = {
  type: string;
  coordinates: unknown;
};

type AlertFeature = {
  id?: string;
  geometry?: Geometry | null;
  properties?: Record<string, unknown>;
};

type FeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id: string;
    geometry: Geometry;
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
  }>;
};

const querySchema = z.object({
  state: z
    .string()
    .optional()
    .transform((value) => value?.trim().toUpperCase())
    .refine((value) => !value || /^[A-Z]{2}$/.test(value), {
      message: "state must be a 2-letter code"
    }),
  bbox: z
    .string()
    .optional()
    .transform((value) => {
      if (!value) {
        return null;
      }

      const parts = value
        .split(",")
        .map((part) => Number(part.trim()))
        .filter((part) => Number.isFinite(part));

      if (parts.length !== 4) {
        return null;
      }

      const [minLng, minLat, maxLng, maxLat] = parts;
      if (minLng >= maxLng || minLat >= maxLat) {
        return null;
      }

      return [minLng, minLat, maxLng, maxLat] as [number, number, number, number];
    })
});

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function pushCoordinate(values: number[], point: unknown) {
  if (!Array.isArray(point) || point.length < 2) {
    return;
  }

  const lng = point[0];
  const lat = point[1];
  if (isNumber(lng) && isNumber(lat)) {
    values.push(lng, lat);
  }
}

function flattenGeometry(geometry: Geometry): number[] {
  const points: number[] = [];

  if (geometry.type === "Point") {
    pushCoordinate(points, geometry.coordinates);
    return points;
  }

  const stack: unknown[] = [geometry.coordinates];
  while (stack.length > 0) {
    const current = stack.pop();
    if (Array.isArray(current)) {
      if (current.length > 0 && Array.isArray(current[0])) {
        for (const nested of current) {
          stack.push(nested);
        }
      } else {
        pushCoordinate(points, current);
      }
    }
  }

  return points;
}

function geometryBbox(geometry: Geometry): [number, number, number, number] | null {
  const flattened = flattenGeometry(geometry);
  if (flattened.length < 2) {
    return null;
  }

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (let index = 0; index < flattened.length; index += 2) {
    const lng = flattened[index];
    const lat = flattened[index + 1];
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }

  if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) {
    return null;
  }

  return [minLng, minLat, maxLng, maxLat];
}

function intersectsBbox(a: [number, number, number, number], b: [number, number, number, number]): boolean {
  const [aMinLng, aMinLat, aMaxLng, aMaxLat] = a;
  const [bMinLng, bMinLat, bMaxLng, bMaxLat] = b;
  return !(aMaxLng < bMinLng || aMinLng > bMaxLng || aMaxLat < bMinLat || aMinLat > bMaxLat);
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(request: NextRequest) {
  try {
    const parsed = querySchema.parse({
      state: request.nextUrl.searchParams.get("state") ?? undefined,
      bbox: request.nextUrl.searchParams.get("bbox") ?? undefined
    });

    const noaaUrl = new URL("https://api.weather.gov/alerts/active");
    noaaUrl.searchParams.set("status", "actual");
    noaaUrl.searchParams.set("message_type", "alert");
    if (parsed.state) {
      noaaUrl.searchParams.set("area", parsed.state);
    }

    const response = await fetch(noaaUrl.toString(), {
      headers: {
        "User-Agent": "USWebcamMonitor/0.1 (admin@localhost)",
        Accept: "application/geo+json"
      },
      next: {
        revalidate: 300
      }
    });

    if (!response.ok) {
      throw new Error(`NOAA alerts request failed (${response.status})`);
    }

    const payload = (await response.json()) as {
      features?: AlertFeature[];
    };

    const features: FeatureCollection["features"] = [];

    for (const feature of payload.features ?? []) {
      if (!feature.geometry || !feature.properties) {
        continue;
      }

      const bbox = geometryBbox(feature.geometry);
      if (parsed.bbox && bbox && !intersectsBbox(parsed.bbox, bbox)) {
        continue;
      }

      const id = asString(feature.id) ?? crypto.randomUUID();
      features.push({
        type: "Feature",
        id,
        geometry: feature.geometry,
        properties: {
          id,
          event: asString(feature.properties.event),
          severity: asString(feature.properties.severity),
          certainty: asString(feature.properties.certainty),
          urgency: asString(feature.properties.urgency),
          areaDesc: asString(feature.properties.areaDesc),
          headline: asString(feature.properties.headline),
          sent: asString(feature.properties.sent),
          ends: asString(feature.properties.ends),
          senderName: asString(feature.properties.senderName),
          instruction: asString(feature.properties.instruction),
          web: asString(feature.properties.web)
        }
      });
    }

    return NextResponse.json({
      type: "FeatureCollection",
      features,
      count: features.length,
      source: "NOAA / api.weather.gov"
    } satisfies FeatureCollection & { count: number; source: string });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to fetch storm alerts",
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
