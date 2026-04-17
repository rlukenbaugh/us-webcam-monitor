import {
  CameraCategory,
  CameraStatus,
  PrismaClient,
  SourceType,
  StreamType,
  SubmissionStatus
} from "@prisma/client";
import slugify from "slugify";

const prisma = new PrismaClient();

type SeedCamera = {
  externalId: string;
  sourceKey: string;
  sourceType: SourceType;
  name: string;
  category: CameraCategory;
  city: string;
  stateCode: string;
  latitude: number;
  longitude: number;
  pageUrl: string;
  providerUrl: string;
  streamUrl?: string;
  imageUrl?: string;
  streamType: StreamType;
  tags: string[];
  status: CameraStatus;
  confidenceScore: number;
};

const seedSources = [
  {
    key: "mndot-511",
    name: "Minnesota 511 Cameras",
    type: SourceType.DOT,
    baseUrl: "https://511mn.org/",
    attribution: "Minnesota Department of Transportation",
    syncCron: "*/30 * * * *"
  },
  {
    key: "wa-dot",
    name: "Washington DOT Cameras",
    type: SourceType.DOT,
    baseUrl: "https://wsdot.wa.gov/",
    attribution: "Washington State Department of Transportation",
    syncCron: "*/30 * * * *"
  },
  {
    key: "ohgo-dot",
    name: "Ohio OHGO Cameras",
    type: SourceType.DOT,
    baseUrl: "https://www.ohgo.com/",
    attribution: "Ohio Department of Transportation",
    syncCron: "*/30 * * * *"
  },
  {
    key: "faa-weather",
    name: "FAA Weather Cameras",
    type: SourceType.WEATHER,
    baseUrl: "https://www.faa.gov/",
    attribution: "Federal Aviation Administration",
    syncCron: "0 * * * *"
  },
  {
    key: "caltrans-quickmap",
    name: "Caltrans QuickMap Cameras",
    type: SourceType.DOT,
    baseUrl: "https://quickmap.dot.ca.gov/",
    attribution: "California Department of Transportation",
    syncCron: "*/30 * * * *"
  },
  {
    key: "transtar-tx",
    name: "Houston TranStar Cameras",
    type: SourceType.DOT,
    baseUrl: "https://traffic.houstontranstar.org/",
    attribution: "Houston TranStar",
    syncCron: "*/30 * * * *"
  },
  {
    key: "fl511",
    name: "Florida 511 Cameras",
    type: SourceType.DOT,
    baseUrl: "https://fl511.com/",
    attribution: "Florida 511",
    syncCron: "*/30 * * * *"
  },
  {
    key: "cotrip",
    name: "COtrip Cameras",
    type: SourceType.DOT,
    baseUrl: "https://maps.cotrip.org/",
    attribution: "Colorado Department of Transportation",
    syncCron: "*/30 * * * *"
  },
  {
    key: "511ny",
    name: "511NY Cameras",
    type: SourceType.DOT,
    baseUrl: "https://511ny.org/",
    attribution: "New York State 511",
    syncCron: "*/30 * * * *"
  },
  {
    key: "travelmidwest",
    name: "Travel Midwest Cameras",
    type: SourceType.DOT,
    baseUrl: "https://www.travelmidwest.com/",
    attribution: "Travel Midwest",
    syncCron: "*/30 * * * *"
  },
  {
    key: "nps-webcams",
    name: "National Park Service Webcams",
    type: SourceType.TOURISM,
    baseUrl: "https://www.nps.gov/",
    attribution: "National Park Service",
    syncCron: "0 */6 * * *"
  },
  {
    key: "visit-new-orleans",
    name: "New Orleans Tourism Webcams",
    type: SourceType.TOURISM,
    baseUrl: "https://www.neworleans.com/",
    attribution: "New Orleans & Company",
    syncCron: "0 */6 * * *"
  },
  {
    key: "visit-florida",
    name: "Visit Florida Webcams",
    type: SourceType.TOURISM,
    baseUrl: "https://www.visitflorida.com/",
    attribution: "VISIT FLORIDA",
    syncCron: "0 */6 * * *"
  },
  {
    key: "mackinac-bridge-authority",
    name: "Mackinac Bridge Camera",
    type: SourceType.TOURISM,
    baseUrl: "https://www.mackinacbridge.org/",
    attribution: "Mackinac Bridge Authority",
    syncCron: "0 */6 * * *"
  },
  {
    key: "manual-submissions",
    name: "Manual Submissions",
    type: SourceType.MANUAL,
    attribution: "Community submissions",
    syncCron: "*/10 * * * *"
  }
];

const seedRegions = [
  { stateCode: "WA", city: "Seattle", name: "Seattle, WA", slug: "seattle-wa" },
  { stateCode: "WA", city: "Spokane", name: "Spokane, WA", slug: "spokane-wa" },
  { stateCode: "MN", city: "Minneapolis", name: "Minneapolis, MN", slug: "minneapolis-mn" },
  { stateCode: "OH", city: "Columbus", name: "Columbus, OH", slug: "columbus-oh" },
  { stateCode: "OH", city: "Cleveland", name: "Cleveland, OH", slug: "cleveland-oh" },
  { stateCode: "AK", city: "Anchorage", name: "Anchorage, AK", slug: "anchorage-ak" },
  { stateCode: "CA", city: "Los Angeles", name: "Los Angeles, CA", slug: "los-angeles-ca" },
  { stateCode: "TX", city: "Houston", name: "Houston, TX", slug: "houston-tx" },
  { stateCode: "FL", city: "Miami", name: "Miami, FL", slug: "miami-fl" },
  { stateCode: "CO", city: "Denver", name: "Denver, CO", slug: "denver-co" },
  { stateCode: "NY", city: "New York", name: "New York, NY", slug: "new-york-ny" },
  { stateCode: "IL", city: "Chicago", name: "Chicago, IL", slug: "chicago-il" },
  { stateCode: "WY", city: "Yellowstone National Park", name: "Yellowstone National Park, WY", slug: "yellowstone-national-park-wy" },
  { stateCode: "LA", city: "New Orleans", name: "New Orleans, LA", slug: "new-orleans-la" },
  { stateCode: "MI", city: "St. Ignace", name: "St. Ignace, MI", slug: "st-ignace-mi" },
  { stateCode: "FL", city: "Pensacola Beach", name: "Pensacola Beach, FL", slug: "pensacola-beach-fl" }
];

const seedTags = [
  "interstate",
  "downtown",
  "airport",
  "bridge",
  "snow",
  "harbor",
  "freeway",
  "traffic",
  "weather",
  "park",
  "beach",
  "tourism",
  "scenic",
  "mountain"
];

const seedCameras: SeedCamera[] = [
  {
    externalId: "wa-101",
    sourceKey: "wa-dot",
    sourceType: SourceType.DOT,
    name: "I-5 at Pine St",
    category: CameraCategory.TRAFFIC,
    city: "Seattle",
    stateCode: "WA",
    latitude: 47.6132,
    longitude: -122.333,
    pageUrl: "https://wsdot.wa.gov/travel/real-time/cameras",
    providerUrl: "https://wsdot.wa.gov/",
    imageUrl: "https://images.pexels.com/photos/325193/pexels-photo-325193.jpeg",
    streamType: StreamType.JPEG,
    tags: ["interstate", "downtown", "traffic"],
    status: CameraStatus.ONLINE,
    confidenceScore: 0.88
  },
  {
    externalId: "wa-204",
    sourceKey: "wa-dot",
    sourceType: SourceType.DOT,
    name: "US 2 at Spokane River",
    category: CameraCategory.TRAFFIC,
    city: "Spokane",
    stateCode: "WA",
    latitude: 47.6588,
    longitude: -117.426,
    pageUrl: "https://wsdot.wa.gov/travel/real-time/cameras",
    providerUrl: "https://wsdot.wa.gov/",
    imageUrl: "https://images.pexels.com/photos/210617/pexels-photo-210617.jpeg",
    streamType: StreamType.JPEG,
    tags: ["bridge", "freeway", "traffic"],
    status: CameraStatus.ONLINE,
    confidenceScore: 0.81
  },
  {
    externalId: "oh-331",
    sourceKey: "ohgo-dot",
    sourceType: SourceType.DOT,
    name: "I-70 at High St",
    category: CameraCategory.TRAFFIC,
    city: "Columbus",
    stateCode: "OH",
    latitude: 39.9601,
    longitude: -82.9988,
    pageUrl: "https://www.ohgo.com/",
    providerUrl: "https://www.ohgo.com/",
    streamUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    streamType: StreamType.HLS,
    tags: ["interstate", "downtown", "traffic"],
    status: CameraStatus.ONLINE,
    confidenceScore: 0.9
  },
  {
    externalId: "oh-541",
    sourceKey: "ohgo-dot",
    sourceType: SourceType.DOT,
    name: "I-90 at East 55th",
    category: CameraCategory.TRAFFIC,
    city: "Cleveland",
    stateCode: "OH",
    latitude: 41.4988,
    longitude: -81.668,
    pageUrl: "https://www.ohgo.com/",
    providerUrl: "https://www.ohgo.com/",
    imageUrl: "https://images.pexels.com/photos/358319/pexels-photo-358319.jpeg",
    streamType: StreamType.JPEG,
    tags: ["freeway", "traffic"],
    status: CameraStatus.UNKNOWN,
    confidenceScore: 0.52
  },
  {
    externalId: "faa-9001",
    sourceKey: "faa-weather",
    sourceType: SourceType.WEATHER,
    name: "Anchorage Field Cam",
    category: CameraCategory.AVIATION,
    city: "Anchorage",
    stateCode: "AK",
    latitude: 61.1744,
    longitude: -149.9964,
    pageUrl: "https://www.faa.gov/",
    providerUrl: "https://www.faa.gov/",
    imageUrl: "https://images.pexels.com/photos/46148/aircraft-jet-landing-cloud-46148.jpeg",
    streamType: StreamType.JPEG,
    tags: ["airport", "weather", "snow"],
    status: CameraStatus.ONLINE,
    confidenceScore: 0.77
  },
  {
    externalId: "ca-quickmap-la-001",
    sourceKey: "caltrans-quickmap",
    sourceType: SourceType.DOT,
    name: "US-101 at Downtown Los Angeles",
    category: CameraCategory.TRAFFIC,
    city: "Los Angeles",
    stateCode: "CA",
    latitude: 34.0562,
    longitude: -118.2468,
    pageUrl: "https://quickmap.dot.ca.gov/",
    providerUrl: "https://quickmap.dot.ca.gov/",
    streamType: StreamType.UNKNOWN,
    tags: ["traffic", "downtown", "freeway"],
    status: CameraStatus.UNKNOWN,
    confidenceScore: 0.48
  },
  {
    externalId: "tx-transtar-houston-001",
    sourceKey: "transtar-tx",
    sourceType: SourceType.DOT,
    name: "I-45 at Downtown Houston",
    category: CameraCategory.TRAFFIC,
    city: "Houston",
    stateCode: "TX",
    latitude: 29.7604,
    longitude: -95.3698,
    pageUrl: "https://traffic.houstontranstar.org/layers/",
    providerUrl: "https://traffic.houstontranstar.org/",
    streamType: StreamType.UNKNOWN,
    tags: ["traffic", "downtown", "interstate"],
    status: CameraStatus.UNKNOWN,
    confidenceScore: 0.49
  },
  {
    externalId: "fl-511-miami-001",
    sourceKey: "fl511",
    sourceType: SourceType.DOT,
    name: "I-95 at Downtown Miami",
    category: CameraCategory.TRAFFIC,
    city: "Miami",
    stateCode: "FL",
    latitude: 25.7743,
    longitude: -80.1937,
    pageUrl: "https://fl511.com/cctv",
    providerUrl: "https://fl511.com/",
    streamType: StreamType.UNKNOWN,
    tags: ["traffic", "interstate", "downtown"],
    status: CameraStatus.UNKNOWN,
    confidenceScore: 0.48
  },
  {
    externalId: "co-cotrip-denver-001",
    sourceKey: "cotrip",
    sourceType: SourceType.DOT,
    name: "I-70 near Downtown Denver",
    category: CameraCategory.TRAFFIC,
    city: "Denver",
    stateCode: "CO",
    latitude: 39.7392,
    longitude: -104.9903,
    pageUrl: "https://maps.cotrip.org/",
    providerUrl: "https://maps.cotrip.org/",
    streamType: StreamType.UNKNOWN,
    tags: ["traffic", "interstate", "mountain"],
    status: CameraStatus.UNKNOWN,
    confidenceScore: 0.47
  },
  {
    externalId: "ny-511-001",
    sourceKey: "511ny",
    sourceType: SourceType.DOT,
    name: "FDR Drive at Midtown Manhattan",
    category: CameraCategory.TRAFFIC,
    city: "New York",
    stateCode: "NY",
    latitude: 40.7549,
    longitude: -73.9717,
    pageUrl: "https://511ny.org/cctv",
    providerUrl: "https://511ny.org/",
    streamType: StreamType.UNKNOWN,
    tags: ["traffic", "downtown", "interstate"],
    status: CameraStatus.UNKNOWN,
    confidenceScore: 0.48
  },
  {
    externalId: "il-travelmidwest-001",
    sourceKey: "travelmidwest",
    sourceType: SourceType.DOT,
    name: "Dan Ryan Expressway at Downtown Chicago",
    category: CameraCategory.TRAFFIC,
    city: "Chicago",
    stateCode: "IL",
    latitude: 41.8781,
    longitude: -87.6298,
    pageUrl: "https://www.travelmidwest.com/lmiga/cameraViewer.jsp",
    providerUrl: "https://www.travelmidwest.com/",
    streamType: StreamType.UNKNOWN,
    tags: ["traffic", "downtown", "freeway"],
    status: CameraStatus.UNKNOWN,
    confidenceScore: 0.47
  },
  {
    externalId: "nps-yellowstone-001",
    sourceKey: "nps-webcams",
    sourceType: SourceType.TOURISM,
    name: "Old Faithful Live View",
    category: CameraCategory.PARK,
    city: "Yellowstone National Park",
    stateCode: "WY",
    latitude: 44.4605,
    longitude: -110.8281,
    pageUrl: "https://www.nps.gov/yell/learn/photosmultimedia/webcams.htm",
    providerUrl: "https://www.nps.gov/yell/index.htm",
    streamType: StreamType.UNKNOWN,
    tags: ["park", "tourism", "scenic"],
    status: CameraStatus.UNKNOWN,
    confidenceScore: 0.52
  },
  {
    externalId: "nps-yosemite-001",
    sourceKey: "nps-webcams",
    sourceType: SourceType.TOURISM,
    name: "Yosemite Valley Webcam",
    category: CameraCategory.PARK,
    city: "Yosemite Valley",
    stateCode: "CA",
    latitude: 37.7485,
    longitude: -119.5886,
    pageUrl: "https://www.nps.gov/yose/learn/photosmultimedia/webcams.htm",
    providerUrl: "https://www.nps.gov/yose/index.htm",
    streamType: StreamType.UNKNOWN,
    tags: ["park", "mountain", "scenic"],
    status: CameraStatus.UNKNOWN,
    confidenceScore: 0.52
  },
  {
    externalId: "la-neworleans-001",
    sourceKey: "visit-new-orleans",
    sourceType: SourceType.TOURISM,
    name: "French Quarter Streetscape Cam",
    category: CameraCategory.DOWNTOWN,
    city: "New Orleans",
    stateCode: "LA",
    latitude: 29.9584,
    longitude: -90.0644,
    pageUrl: "https://www.neworleans.com/plan/webcams/",
    providerUrl: "https://www.neworleans.com/",
    streamType: StreamType.UNKNOWN,
    tags: ["tourism", "downtown", "scenic"],
    status: CameraStatus.UNKNOWN,
    confidenceScore: 0.45
  },
  {
    externalId: "mi-mackinac-001",
    sourceKey: "mackinac-bridge-authority",
    sourceType: SourceType.TOURISM,
    name: "Mackinac Bridge Cam",
    category: CameraCategory.HARBOR,
    city: "St. Ignace",
    stateCode: "MI",
    latitude: 45.8174,
    longitude: -84.7278,
    pageUrl: "https://www.mackinacbridge.org/fares-traffic/bridge-cam/",
    providerUrl: "https://www.mackinacbridge.org/",
    streamType: StreamType.UNKNOWN,
    tags: ["bridge", "harbor", "scenic"],
    status: CameraStatus.UNKNOWN,
    confidenceScore: 0.46
  },
  {
    externalId: "fl-visitflorida-001",
    sourceKey: "visit-florida",
    sourceType: SourceType.TOURISM,
    name: "Pensacola Beach Surf Cam",
    category: CameraCategory.BEACH,
    city: "Pensacola Beach",
    stateCode: "FL",
    latitude: 30.3335,
    longitude: -87.1428,
    pageUrl: "https://www.visitflorida.com/travel-ideas/articles/florida-webcams/",
    providerUrl: "https://www.visitflorida.com/",
    streamType: StreamType.UNKNOWN,
    tags: ["beach", "tourism", "scenic"],
    status: CameraStatus.UNKNOWN,
    confidenceScore: 0.44
  }
];

async function main() {
  for (const source of seedSources) {
    await prisma.source.upsert({
      where: { key: source.key },
      update: source,
      create: source
    });
  }

  for (const region of seedRegions) {
    await prisma.region.upsert({
      where: { slug: region.slug },
      update: region,
      create: region
    });
  }

  for (const tag of seedTags) {
    await prisma.tag.upsert({
      where: { slug: slugify(tag, { lower: true, strict: true }) },
      update: { name: tag },
      create: {
        name: tag,
        slug: slugify(tag, { lower: true, strict: true })
      }
    });
  }

  for (const camera of seedCameras) {
    const source = await prisma.source.findUniqueOrThrow({ where: { key: camera.sourceKey } });
    const region = await prisma.region.findFirst({
      where: {
        stateCode: camera.stateCode,
        city: camera.city
      }
    });

    const slug = slugify(`${camera.name}-${camera.stateCode}-${camera.externalId}`, {
      lower: true,
      strict: true
    });

    const upserted = await prisma.camera.upsert({
      where: { slug },
      update: {
        externalId: camera.externalId,
        sourceId: source.id,
        sourceType: camera.sourceType,
        name: camera.name,
        category: camera.category,
        city: camera.city,
        stateCode: camera.stateCode,
        latitude: camera.latitude,
        longitude: camera.longitude,
        pageUrl: camera.pageUrl,
        providerUrl: camera.providerUrl,
        status: camera.status,
        confidenceScore: camera.confidenceScore,
        regionId: region?.id,
        raw: { seeded: true, sourceKey: camera.sourceKey }
      },
      create: {
        externalId: camera.externalId,
        sourceId: source.id,
        sourceType: camera.sourceType,
        name: camera.name,
        slug,
        category: camera.category,
        city: camera.city,
        stateCode: camera.stateCode,
        latitude: camera.latitude,
        longitude: camera.longitude,
        pageUrl: camera.pageUrl,
        providerUrl: camera.providerUrl,
        status: camera.status,
        confidenceScore: camera.confidenceScore,
        regionId: region?.id,
        raw: { seeded: true, sourceKey: camera.sourceKey }
      }
    });

    await prisma.$transaction([
      prisma.cameraStream.deleteMany({ where: { cameraId: upserted.id } }),
      prisma.cameraImage.deleteMany({ where: { cameraId: upserted.id } }),
      prisma.cameraTag.deleteMany({ where: { cameraId: upserted.id } })
    ]);

    if (camera.streamUrl) {
      await prisma.cameraStream.create({
        data: {
          cameraId: upserted.id,
          url: camera.streamUrl,
          type: camera.streamType,
          status: camera.status,
          isEmbeddable: camera.streamType === StreamType.HLS
        }
      });
    }

    if (camera.imageUrl) {
      await prisma.cameraImage.create({
        data: {
          cameraId: upserted.id,
          url: camera.imageUrl,
          httpStatus: 200,
          lastFetchedAt: new Date()
        }
      });
    }

    for (const tagName of camera.tags) {
      const tag = await prisma.tag.findUniqueOrThrow({
        where: { slug: slugify(tagName, { lower: true, strict: true }) }
      });
      await prisma.cameraTag.create({
        data: {
          cameraId: upserted.id,
          tagId: tag.id
        }
      });
    }

    await prisma.cameraAlias.upsert({
      where: {
        cameraId_normalizedAlias: {
          cameraId: upserted.id,
          normalizedAlias: slugify(camera.name, { lower: true, strict: true })
        }
      },
      update: { alias: camera.name },
      create: {
        cameraId: upserted.id,
        alias: camera.name,
        normalizedAlias: slugify(camera.name, { lower: true, strict: true })
      }
    });
  }

  const manualSource = await prisma.source.findUniqueOrThrow({
    where: { key: "manual-submissions" }
  });

  await prisma.submission.upsert({
    where: { id: "seed-pending-submission" },
    update: {
      status: SubmissionStatus.PENDING,
      sourceId: manualSource.id
    },
    create: {
      id: "seed-pending-submission",
      sourceId: manualSource.id,
      title: "Downtown Live Cam",
      sourceUrl: "https://example.org/cameras/downtown-live",
      embedUrl: "https://player.example.org/embed/123",
      latitude: 34.0522,
      longitude: -118.2437,
      stateCode: "CA",
      city: "Los Angeles",
      category: CameraCategory.DOWNTOWN,
      notes: "User submitted test record",
      contactEmail: "submitter@example.org",
      status: SubmissionStatus.PENDING,
      raw: { seeded: true }
    }
  });

  console.log("Seed complete");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
