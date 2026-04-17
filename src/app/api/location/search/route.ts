import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const searchSchema = z.object({
  q: z.string().trim().min(2).max(120)
});

type NominatimMatch = {
  lat?: string;
  lon?: string;
  display_name?: string;
};

export async function GET(request: NextRequest) {
  try {
    const parsed = searchSchema.parse({
      q: request.nextUrl.searchParams.get("q") ?? ""
    });

    const searchUrl = new URL("https://nominatim.openstreetmap.org/search");
    searchUrl.searchParams.set("format", "jsonv2");
    searchUrl.searchParams.set("countrycodes", "us");
    searchUrl.searchParams.set("limit", "1");
    searchUrl.searchParams.set("q", parsed.q);

    const response = await fetch(searchUrl.toString(), {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "us-webcam-monitor/0.1"
      }
    });

    if (!response.ok) {
      throw new Error(`Location search failed with ${response.status}`);
    }

    const payload = (await response.json()) as NominatimMatch[];
    const match = payload[0];
    const lat = Number(match?.lat);
    const lng = Number(match?.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(
        {
          message: "No location match found"
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      lat,
      lng,
      matchedAddress: match?.display_name ?? parsed.q,
      region: null,
      source: "OpenStreetMap Nominatim",
      query: parsed.q
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to search for a location",
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}
