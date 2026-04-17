import argparse
import json
import math
import random
from collections import Counter
from pathlib import Path
from typing import Dict, List


BATCH_SIZE = 500
TOTAL_RECORDS = 10000
DEFAULT_OUTPUT_DIR = Path("data/generated/webcam_seed_batches")
DEFAULT_INDEX_PATH = Path("data/generated/webcam_seed_index.json")

CATEGORIES = [
    "traffic",
    "beach",
    "park",
    "weather",
    "ski",
    "city",
    "harbor",
    "tourism",
    "town",
]

STREAM_TYPE_WEIGHTS = {
    "traffic": [("MJPEG", 0.35), ("IMAGE", 0.35), ("HLS", 0.2), ("UNKNOWN", 0.1)],
    "beach": [("HLS", 0.35), ("IMAGE", 0.3), ("EMBED", 0.25), ("UNKNOWN", 0.1)],
    "park": [("IMAGE", 0.45), ("HLS", 0.2), ("EMBED", 0.15), ("UNKNOWN", 0.2)],
    "weather": [("IMAGE", 0.45), ("MJPEG", 0.25), ("HLS", 0.1), ("UNKNOWN", 0.2)],
    "ski": [("HLS", 0.35), ("IMAGE", 0.35), ("EMBED", 0.2), ("UNKNOWN", 0.1)],
    "city": [("HLS", 0.3), ("EMBED", 0.3), ("IMAGE", 0.25), ("UNKNOWN", 0.15)],
    "harbor": [("HLS", 0.3), ("IMAGE", 0.35), ("MJPEG", 0.2), ("UNKNOWN", 0.15)],
    "tourism": [("EMBED", 0.35), ("HLS", 0.25), ("IMAGE", 0.25), ("UNKNOWN", 0.15)],
    "town": [("IMAGE", 0.35), ("EMBED", 0.2), ("MJPEG", 0.15), ("UNKNOWN", 0.3)],
}

VIEWPOINTS = {
    "traffic": ["Traffic Camera", "Highway Camera", "Interchange Cam", "Road Watch Cam"],
    "beach": ["Beach Cam", "Surf Cam", "Coastline Cam", "Oceanfront Cam"],
    "park": ["Park Webcam", "Nature Cam", "Wildlife Cam", "Scenic Cam"],
    "weather": ["Weather Cam", "Storm Watch Cam", "Sky Cam", "Conditions Cam"],
    "ski": ["Ski Resort Cam", "Snow Cam", "Base Area Cam", "Lift Cam"],
    "city": ["Skyline Cam", "Downtown Cam", "City Center Webcam", "Main Street Cam"],
    "harbor": ["Harbor Cam", "Marina Cam", "Port Cam", "Ship Watch Cam"],
    "tourism": ["Tourism Cam", "Landmark Webcam", "Boardwalk Cam", "Live View Cam"],
    "town": ["Town Square Cam", "Main Street Cam", "Intersection Cam", "Village Cam"],
}

SOURCE_DEFAULTS = {
    "traffic": ["https://www.511.org/", "https://www.trafficland.com/"],
    "beach": ["https://www.surfline.com/", "https://www.earthcam.com/"],
    "park": ["https://www.nps.gov/", "https://www.explore.org/"],
    "weather": ["https://weather.gov/", "https://www.weatherbug.com/"],
    "ski": ["https://www.onthesnow.com/", "https://www.skiinfo.com/"],
    "city": ["https://www.earthcam.com/", "https://www.skylinewebcams.com/"],
    "harbor": ["https://www.marinetraffic.com/", "https://www.porttechnology.org/"],
    "tourism": ["https://www.earthcam.com/", "https://www.skylinewebcams.com/"],
    "town": ["https://www.earthcam.com/", "https://www.visit-europe.com/"],
}

REGIONS: List[Dict] = [
    {
        "country": "United States",
        "state_or_region": "California",
        "count": 900,
        "category_weights": {
            "traffic": 0.22,
            "beach": 0.18,
            "park": 0.08,
            "weather": 0.08,
            "ski": 0.08,
            "city": 0.12,
            "harbor": 0.08,
            "tourism": 0.1,
            "town": 0.06,
        },
        "source_websites": {
            "traffic": ["https://quickmap.dot.ca.gov/"],
            "beach": ["https://www.visitcalifornia.com/"],
            "park": ["https://www.nps.gov/yose/index.htm"],
            "ski": ["https://www.skiheavenly.com/"],
            "harbor": ["https://www.portoflosangeles.org/"],
        },
        "cities": [
            {"city": "Los Angeles", "lat": 34.0522, "lng": -118.2437},
            {"city": "San Francisco", "lat": 37.7749, "lng": -122.4194},
            {"city": "San Diego", "lat": 32.7157, "lng": -117.1611},
            {"city": "Santa Monica", "lat": 34.0195, "lng": -118.4912},
            {"city": "South Lake Tahoe", "lat": 38.9399, "lng": -119.9772},
            {"city": "Yosemite Valley", "lat": 37.7459, "lng": -119.5936},
        ],
    },
    {
        "country": "United States",
        "state_or_region": "Florida",
        "count": 750,
        "category_weights": {
            "traffic": 0.18,
            "beach": 0.24,
            "park": 0.05,
            "weather": 0.1,
            "ski": 0.0,
            "city": 0.08,
            "harbor": 0.12,
            "tourism": 0.16,
            "town": 0.07,
        },
        "source_websites": {
            "traffic": ["https://fl511.com/"],
            "beach": ["https://www.visitflorida.com/"],
            "harbor": ["https://www.portmiami.biz/"],
            "weather": ["https://www.weatherbug.com/"],
        },
        "cities": [
            {"city": "Miami", "lat": 25.7617, "lng": -80.1918},
            {"city": "Key West", "lat": 24.5551, "lng": -81.78},
            {"city": "Pensacola Beach", "lat": 30.3335, "lng": -87.1428},
            {"city": "Orlando", "lat": 28.5383, "lng": -81.3792},
            {"city": "Tampa", "lat": 27.9506, "lng": -82.4572},
        ],
    },
    {
        "country": "United States",
        "state_or_region": "Texas",
        "count": 850,
        "category_weights": {
            "traffic": 0.28,
            "beach": 0.06,
            "park": 0.04,
            "weather": 0.1,
            "ski": 0.0,
            "city": 0.15,
            "harbor": 0.1,
            "tourism": 0.12,
            "town": 0.15,
        },
        "source_websites": {
            "traffic": ["https://traffic.houstontranstar.org/", "https://its.txdot.gov/"],
            "harbor": ["https://porthouston.com/"],
            "weather": ["https://www.weather.gov/"],
        },
        "cities": [
            {"city": "Houston", "lat": 29.7604, "lng": -95.3698},
            {"city": "Dallas", "lat": 32.7767, "lng": -96.797},
            {"city": "Austin", "lat": 30.2672, "lng": -97.7431},
            {"city": "Galveston", "lat": 29.3013, "lng": -94.7977},
            {"city": "San Antonio", "lat": 29.4241, "lng": -98.4936},
            {"city": "Waco", "lat": 31.5493, "lng": -97.1467},
        ],
    },
    {
        "country": "United States",
        "state_or_region": "New York",
        "count": 700,
        "category_weights": {
            "traffic": 0.28,
            "beach": 0.02,
            "park": 0.06,
            "weather": 0.1,
            "ski": 0.05,
            "city": 0.2,
            "harbor": 0.12,
            "tourism": 0.11,
            "town": 0.06,
        },
        "source_websites": {
            "traffic": ["https://511ny.org/"],
            "harbor": ["https://www.panynj.gov/"],
            "city": ["https://www.timessquarenyc.org/"],
        },
        "cities": [
            {"city": "New York", "lat": 40.7128, "lng": -74.006},
            {"city": "Buffalo", "lat": 42.8864, "lng": -78.8784},
            {"city": "Albany", "lat": 42.6526, "lng": -73.7562},
            {"city": "Lake Placid", "lat": 44.2795, "lng": -73.9799},
            {"city": "Niagara Falls", "lat": 43.0962, "lng": -79.0377},
        ],
    },
    {
        "country": "United States",
        "state_or_region": "Washington",
        "count": 600,
        "category_weights": {
            "traffic": 0.24,
            "beach": 0.04,
            "park": 0.08,
            "weather": 0.12,
            "ski": 0.08,
            "city": 0.12,
            "harbor": 0.12,
            "tourism": 0.12,
            "town": 0.08,
        },
        "source_websites": {
            "traffic": ["https://wsdot.com/travel/real-time/cameras/"],
            "harbor": ["https://www.portseattle.org/"],
            "park": ["https://www.nps.gov/olym/index.htm"],
        },
        "cities": [
            {"city": "Seattle", "lat": 47.6062, "lng": -122.3321},
            {"city": "Spokane", "lat": 47.6588, "lng": -117.426},
            {"city": "Tacoma", "lat": 47.2529, "lng": -122.4443},
            {"city": "Leavenworth", "lat": 47.5962, "lng": -120.6615},
            {"city": "Olympic National Park", "lat": 47.8021, "lng": -123.6044},
        ],
    },
    {
        "country": "United States",
        "state_or_region": "Colorado",
        "count": 450,
        "category_weights": {
            "traffic": 0.2,
            "beach": 0.0,
            "park": 0.1,
            "weather": 0.12,
            "ski": 0.22,
            "city": 0.12,
            "harbor": 0.0,
            "tourism": 0.14,
            "town": 0.1,
        },
        "source_websites": {
            "traffic": ["https://maps.cotrip.org/"],
            "ski": ["https://www.vail.com/"],
            "park": ["https://www.nps.gov/romo/index.htm"],
        },
        "cities": [
            {"city": "Denver", "lat": 39.7392, "lng": -104.9903},
            {"city": "Vail", "lat": 39.6403, "lng": -106.3742},
            {"city": "Aspen", "lat": 39.1911, "lng": -106.8175},
            {"city": "Breckenridge", "lat": 39.4817, "lng": -106.0384},
            {"city": "Estes Park", "lat": 40.3772, "lng": -105.5217},
        ],
    },
    {
        "country": "United States",
        "state_or_region": "Utah",
        "count": 350,
        "category_weights": {
            "traffic": 0.2,
            "beach": 0.0,
            "park": 0.18,
            "weather": 0.14,
            "ski": 0.16,
            "city": 0.08,
            "harbor": 0.0,
            "tourism": 0.16,
            "town": 0.08,
        },
        "source_websites": {
            "traffic": ["https://www.udottraffic.utah.gov/"],
            "park": ["https://www.nps.gov/zion/index.htm"],
            "ski": ["https://www.snowbird.com/"],
        },
        "cities": [
            {"city": "Salt Lake City", "lat": 40.7608, "lng": -111.891},
            {"city": "Park City", "lat": 40.6461, "lng": -111.498},
            {"city": "Moab", "lat": 38.5733, "lng": -109.5498},
            {"city": "Springdale", "lat": 37.1889, "lng": -112.9986},
        ],
    },
    {
        "country": "United States",
        "state_or_region": "Minnesota",
        "count": 350,
        "category_weights": {
            "traffic": 0.24,
            "beach": 0.02,
            "park": 0.1,
            "weather": 0.18,
            "ski": 0.06,
            "city": 0.12,
            "harbor": 0.06,
            "tourism": 0.12,
            "town": 0.1,
        },
        "source_websites": {
            "traffic": ["https://www.dot.state.mn.us/cameras/"],
            "weather": ["https://www.weather.gov/"],
        },
        "cities": [
            {"city": "Minneapolis", "lat": 44.9778, "lng": -93.265},
            {"city": "Saint Paul", "lat": 44.9537, "lng": -93.09},
            {"city": "Duluth", "lat": 46.7867, "lng": -92.1005},
            {"city": "Bemidji", "lat": 47.4736, "lng": -94.8803},
        ],
    },
    {
        "country": "United States",
        "state_or_region": "Alaska",
        "count": 550,
        "category_weights": {
            "traffic": 0.08,
            "beach": 0.0,
            "park": 0.2,
            "weather": 0.22,
            "ski": 0.03,
            "city": 0.05,
            "harbor": 0.16,
            "tourism": 0.16,
            "town": 0.1,
        },
        "source_websites": {
            "weather": ["https://avcams.faa.gov/"],
            "harbor": ["https://dot.alaska.gov/"],
            "park": ["https://www.nps.gov/dena/index.htm"],
        },
        "cities": [
            {"city": "Anchorage", "lat": 61.2181, "lng": -149.9003},
            {"city": "Juneau", "lat": 58.3019, "lng": -134.4197},
            {"city": "Fairbanks", "lat": 64.8378, "lng": -147.7164},
            {"city": "Seward", "lat": 60.1042, "lng": -149.4422},
            {"city": "Denali National Park", "lat": 63.1148, "lng": -151.1926},
        ],
    },
    {
        "country": "United States",
        "state_or_region": "Hawaii",
        "count": 500,
        "category_weights": {
            "traffic": 0.08,
            "beach": 0.28,
            "park": 0.06,
            "weather": 0.12,
            "ski": 0.0,
            "city": 0.08,
            "harbor": 0.12,
            "tourism": 0.18,
            "town": 0.08,
        },
        "source_websites": {
            "beach": ["https://www.gohawaii.com/"],
            "harbor": ["https://www.hawaii-guide.com/"],
            "weather": ["https://www.weather.gov/hfo/"],
        },
        "cities": [
            {"city": "Honolulu", "lat": 21.3069, "lng": -157.8583},
            {"city": "Waikiki", "lat": 21.2767, "lng": -157.8267},
            {"city": "Kailua-Kona", "lat": 19.639, "lng": -155.9969},
            {"city": "Hilo", "lat": 19.7073, "lng": -155.0885},
            {"city": "Lahaina", "lat": 20.8783, "lng": -156.6825},
        ],
    },
    {
        "country": "United Kingdom",
        "state_or_region": "England",
        "count": 600,
        "category_weights": {
            "traffic": 0.18,
            "beach": 0.05,
            "park": 0.06,
            "weather": 0.1,
            "ski": 0.0,
            "city": 0.22,
            "harbor": 0.12,
            "tourism": 0.17,
            "town": 0.1,
        },
        "source_websites": {
            "traffic": ["https://nationalhighways.co.uk/"],
            "city": ["https://www.visitlondon.com/"],
            "harbor": ["https://www.portofdover.com/"],
        },
        "cities": [
            {"city": "London", "lat": 51.5072, "lng": -0.1276},
            {"city": "Brighton", "lat": 50.8225, "lng": -0.1372},
            {"city": "Manchester", "lat": 53.4808, "lng": -2.2426},
            {"city": "Liverpool", "lat": 53.4084, "lng": -2.9916},
            {"city": "York", "lat": 53.96, "lng": -1.0873},
        ],
    },
    {
        "country": "Norway",
        "state_or_region": "Norway",
        "count": 350,
        "category_weights": {
            "traffic": 0.18,
            "beach": 0.0,
            "park": 0.1,
            "weather": 0.16,
            "ski": 0.12,
            "city": 0.1,
            "harbor": 0.14,
            "tourism": 0.14,
            "town": 0.06,
        },
        "source_websites": {
            "traffic": ["https://www.vegvesen.no/trafikk/"],
            "harbor": ["https://www.portofoslo.no/"],
            "ski": ["https://www.skistar.com/"],
        },
        "cities": [
            {"city": "Oslo", "lat": 59.9139, "lng": 10.7522},
            {"city": "Bergen", "lat": 60.3913, "lng": 5.3221},
            {"city": "Tromso", "lat": 69.6492, "lng": 18.9553},
            {"city": "Geiranger", "lat": 62.1015, "lng": 7.2067},
        ],
    },
    {
        "country": "Sweden",
        "state_or_region": "Sweden",
        "count": 300,
        "category_weights": {
            "traffic": 0.18,
            "beach": 0.02,
            "park": 0.1,
            "weather": 0.15,
            "ski": 0.1,
            "city": 0.14,
            "harbor": 0.1,
            "tourism": 0.13,
            "town": 0.08,
        },
        "source_websites": {
            "traffic": ["https://trafikverket.se/"],
            "harbor": ["https://www.portsofstockholm.com/"],
            "ski": ["https://www.skistar.com/"],
        },
        "cities": [
            {"city": "Stockholm", "lat": 59.3293, "lng": 18.0686},
            {"city": "Gothenburg", "lat": 57.7089, "lng": 11.9746},
            {"city": "Are", "lat": 63.3988, "lng": 13.0828},
            {"city": "Malmo", "lat": 55.605, "lng": 13.0038},
        ],
    },
    {
        "country": "Germany",
        "state_or_region": "Germany",
        "count": 550,
        "category_weights": {
            "traffic": 0.22,
            "beach": 0.02,
            "park": 0.06,
            "weather": 0.12,
            "ski": 0.08,
            "city": 0.2,
            "harbor": 0.08,
            "tourism": 0.14,
            "town": 0.08,
        },
        "source_websites": {
            "traffic": ["https://www.autobahn.de/"],
            "city": ["https://www.visitberlin.de/"],
            "harbor": ["https://www.hafen-hamburg.de/"],
        },
        "cities": [
            {"city": "Berlin", "lat": 52.52, "lng": 13.405},
            {"city": "Hamburg", "lat": 53.5511, "lng": 9.9937},
            {"city": "Munich", "lat": 48.1351, "lng": 11.582},
            {"city": "Frankfurt", "lat": 50.1109, "lng": 8.6821},
            {"city": "Garmisch-Partenkirchen", "lat": 47.4917, "lng": 11.0955},
        ],
    },
    {
        "country": "France",
        "state_or_region": "France",
        "count": 450,
        "category_weights": {
            "traffic": 0.16,
            "beach": 0.07,
            "park": 0.06,
            "weather": 0.11,
            "ski": 0.1,
            "city": 0.18,
            "harbor": 0.1,
            "tourism": 0.15,
            "town": 0.07,
        },
        "source_websites": {
            "traffic": ["https://www.bison-fute.gouv.fr/"],
            "city": ["https://en.parisinfo.com/"],
            "ski": ["https://www.skiplan.com/"],
        },
        "cities": [
            {"city": "Paris", "lat": 48.8566, "lng": 2.3522},
            {"city": "Nice", "lat": 43.7102, "lng": 7.262},
            {"city": "Chamonix", "lat": 45.9237, "lng": 6.8694},
            {"city": "Marseille", "lat": 43.2965, "lng": 5.3698},
            {"city": "Lyon", "lat": 45.764, "lng": 4.8357},
        ],
    },
    {
        "country": "Italy",
        "state_or_region": "Italy",
        "count": 450,
        "category_weights": {
            "traffic": 0.14,
            "beach": 0.08,
            "park": 0.06,
            "weather": 0.1,
            "ski": 0.1,
            "city": 0.18,
            "harbor": 0.1,
            "tourism": 0.16,
            "town": 0.08,
        },
        "source_websites": {
            "traffic": ["https://www.autostrade.it/"],
            "city": ["https://www.turismoroma.it/"],
            "harbor": ["https://www.port.venice.it/"],
        },
        "cities": [
            {"city": "Rome", "lat": 41.9028, "lng": 12.4964},
            {"city": "Venice", "lat": 45.4408, "lng": 12.3155},
            {"city": "Milan", "lat": 45.4642, "lng": 9.19},
            {"city": "Cortina d'Ampezzo", "lat": 46.537, "lng": 12.1357},
            {"city": "Naples", "lat": 40.8518, "lng": 14.2681},
        ],
    },
    {
        "country": "Spain",
        "state_or_region": "Spain",
        "count": 450,
        "category_weights": {
            "traffic": 0.16,
            "beach": 0.12,
            "park": 0.04,
            "weather": 0.1,
            "ski": 0.06,
            "city": 0.16,
            "harbor": 0.1,
            "tourism": 0.18,
            "town": 0.08,
        },
        "source_websites": {
            "traffic": ["https://www.dgt.es/"],
            "beach": ["https://www.spain.info/"],
            "harbor": ["https://www.puertodebarcelona.cat/"],
        },
        "cities": [
            {"city": "Barcelona", "lat": 41.3851, "lng": 2.1734},
            {"city": "Madrid", "lat": 40.4168, "lng": -3.7038},
            {"city": "Valencia", "lat": 39.4699, "lng": -0.3763},
            {"city": "San Sebastian", "lat": 43.3183, "lng": -1.9812},
            {"city": "Sierra Nevada", "lat": 37.0944, "lng": -3.3987},
        ],
    },
    {
        "country": "Netherlands",
        "state_or_region": "Netherlands",
        "count": 250,
        "category_weights": {
            "traffic": 0.16,
            "beach": 0.08,
            "park": 0.03,
            "weather": 0.08,
            "ski": 0.0,
            "city": 0.2,
            "harbor": 0.16,
            "tourism": 0.17,
            "town": 0.12,
        },
        "source_websites": {
            "traffic": ["https://www.rijkswaterstaat.nl/"],
            "harbor": ["https://www.portofrotterdam.com/"],
            "city": ["https://www.iamsterdam.com/"],
        },
        "cities": [
            {"city": "Amsterdam", "lat": 52.3676, "lng": 4.9041},
            {"city": "Rotterdam", "lat": 51.9244, "lng": 4.4777},
            {"city": "The Hague", "lat": 52.0705, "lng": 4.3007},
            {"city": "Zandvoort", "lat": 52.3713, "lng": 4.5331},
        ],
    },
    {
        "country": "Switzerland",
        "state_or_region": "Switzerland",
        "count": 250,
        "category_weights": {
            "traffic": 0.12,
            "beach": 0.0,
            "park": 0.08,
            "weather": 0.14,
            "ski": 0.2,
            "city": 0.14,
            "harbor": 0.02,
            "tourism": 0.2,
            "town": 0.1,
        },
        "source_websites": {
            "traffic": ["https://www.astra.admin.ch/"],
            "ski": ["https://www.matterhornparadise.ch/"],
            "tourism": ["https://www.myswitzerland.com/"],
        },
        "cities": [
            {"city": "Zurich", "lat": 47.3769, "lng": 8.5417},
            {"city": "Lucerne", "lat": 47.0502, "lng": 8.3093},
            {"city": "Zermatt", "lat": 46.0207, "lng": 7.7491},
            {"city": "Interlaken", "lat": 46.6863, "lng": 7.8632},
        ],
    },
    {
        "country": "Austria",
        "state_or_region": "Austria",
        "count": 350,
        "category_weights": {
            "traffic": 0.14,
            "beach": 0.0,
            "park": 0.06,
            "weather": 0.12,
            "ski": 0.2,
            "city": 0.14,
            "harbor": 0.0,
            "tourism": 0.22,
            "town": 0.12,
        },
        "source_websites": {
            "traffic": ["https://www.asfinag.at/"],
            "ski": ["https://www.skiamade.com/"],
            "tourism": ["https://www.austria.info/"],
        },
        "cities": [
            {"city": "Vienna", "lat": 48.2082, "lng": 16.3738},
            {"city": "Salzburg", "lat": 47.8095, "lng": 13.055},
            {"city": "Innsbruck", "lat": 47.2692, "lng": 11.4041},
            {"city": "Kitzbuhel", "lat": 47.4464, "lng": 12.3924},
        ],
    },
]


def weighted_choice(rng: random.Random, options: Dict[str, float]) -> str:
    items = list(options.items())
    total = sum(weight for _, weight in items)
    threshold = rng.random() * total
    running = 0.0
    for value, weight in items:
        running += weight
        if threshold <= running:
            return value
    return items[-1][0]


def weighted_choice_list(rng: random.Random, options):
    total = sum(weight for _, weight in options)
    threshold = rng.random() * total
    running = 0.0
    for value, weight in options:
        running += weight
        if threshold <= running:
            return value
    return options[-1][0]


def slugify(value: str) -> str:
    normalized = value.lower()
    replacements = {
        " ": "-",
        "/": "-",
        "&": "and",
        "'": "",
        ".": "",
        ",": "",
    }
    for old, new in replacements.items():
        normalized = normalized.replace(old, new)
    normalized = "".join(ch for ch in normalized if ch.isalnum() or ch == "-")
    while "--" in normalized:
        normalized = normalized.replace("--", "-")
    return normalized.strip("-")


def stream_path_for(stream_type: str) -> str:
    if stream_type == "MJPEG":
        return "video.mjpg"
    if stream_type == "HLS":
        return "master.m3u8"
    if stream_type == "IMAGE":
        return "snapshot.jpg"
    if stream_type == "EMBED":
        return "webcam"
    return "camera"


def jitter_coordinate(base: float, rng: random.Random, scale: float) -> float:
    return round(base + rng.uniform(-scale, scale), 6)


def coordinate_scale(country: str) -> float:
    return 0.12 if country == "United States" else 0.09


def build_camera_name(city: str, category: str, record_index: int) -> str:
    viewpoint = VIEWPOINTS[category][record_index % len(VIEWPOINTS[category])]
    return f"{city} {viewpoint}"


def generate_records(stream_domain: str, seed: int):
    rng = random.Random(seed)
    records = []
    country_counts = Counter()
    category_counts = Counter()

    running_id = 1

    for region in REGIONS:
        scale = coordinate_scale(region["country"])
        for region_index in range(region["count"]):
            category = weighted_choice(rng, region["category_weights"])
            city = region["cities"][region_index % len(region["cities"])]
            stream_type = weighted_choice_list(rng, STREAM_TYPE_WEIGHTS[category])
            camera_name = build_camera_name(city["city"], category, region_index)
            source_pool = region.get("source_websites", {}).get(category, SOURCE_DEFAULTS[category])
            source_website = source_pool[region_index % len(source_pool)]
            slug = slugify(
                f"{region['country']}-{region['state_or_region']}-{city['city']}-{category}-{running_id}"
            )
            record = {
                "id": f"seed-{running_id:05d}",
                "camera_name": camera_name,
                "latitude": jitter_coordinate(city["lat"], rng, scale),
                "longitude": jitter_coordinate(city["lng"], rng, scale),
                "country": region["country"],
                "state_or_region": region["state_or_region"],
                "city": city["city"],
                "category": category,
                "stream_url": f"{stream_domain.rstrip('/')}/{slug}/{stream_path_for(stream_type)}",
                "stream_type": stream_type,
                "source_website": source_website,
                "status": "unknown",
            }
            records.append(record)
            country_counts[region["country"]] += 1
            category_counts[category] += 1
            running_id += 1

    if len(records) != TOTAL_RECORDS:
        raise RuntimeError(f"Expected {TOTAL_RECORDS} records, generated {len(records)}")

    return records, country_counts, category_counts


def write_batches(records, output_dir: Path):
    output_dir.mkdir(parents=True, exist_ok=True)
    batch_paths = []
    total_batches = math.ceil(len(records) / BATCH_SIZE)

    for batch_number in range(total_batches):
        start = batch_number * BATCH_SIZE
        end = start + BATCH_SIZE
        batch_records = records[start:end]
        batch_path = output_dir / f"batch_{batch_number + 1:02d}.json"
        with batch_path.open("w", encoding="utf-8") as handle:
            json.dump(batch_records, handle, indent=2)
        batch_paths.append(str(batch_path))

    return batch_paths


def write_index(records, batch_paths, country_counts, category_counts, index_path: Path):
    index_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "meta": {
            "dataset_type": "synthetic_seed",
            "total_records": len(records),
            "batch_size": BATCH_SIZE,
            "batch_count": len(batch_paths),
            "status_policy": "unknown",
            "note": (
                "This file contains synthetic seed records for discovery bootstrapping. "
                "The coordinates, names, categories, and source websites are geographically plausible, "
                "but stream endpoints are placeholder-style seed URLs and are not validated live feeds."
            ),
        },
        "distribution": {
            "by_country": dict(country_counts),
            "by_category": dict(category_counts),
        },
        "batches": batch_paths,
        "sample": records[:10],
    }

    with index_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate a synthetic 10,000-record webcam seed dataset in 500-record JSON batches."
    )
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help="Directory where batch JSON files will be written.",
    )
    parser.add_argument(
        "--index-path",
        default=str(DEFAULT_INDEX_PATH),
        help="Path for the generated index/manifest JSON file.",
    )
    parser.add_argument(
        "--stream-domain",
        default="https://seedcams.us-webcam-monitor.local",
        help="Base domain used for generated placeholder stream URLs.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for deterministic output.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    output_dir = Path(args.output_dir)
    index_path = Path(args.index_path)

    records, country_counts, category_counts = generate_records(
        stream_domain=args.stream_domain,
        seed=args.seed,
    )
    batch_paths = write_batches(records, output_dir)
    write_index(records, batch_paths, country_counts, category_counts, index_path)

    print(f"Generated {len(records)} synthetic webcam seed records.")
    print(f"Wrote {len(batch_paths)} batch files to {output_dir}.")
    print(f"Wrote dataset index to {index_path}.")


if __name__ == "__main__":
    main()
