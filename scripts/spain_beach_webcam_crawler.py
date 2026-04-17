import csv
import json
import re
import time
from collections import deque
from urllib import robotparser
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

# =========================================================
# CONFIG
# =========================================================

SEED_URLS = [
    "https://www.skylinewebcams.com/en/webcam/espana.html",
    "https://www.webcamtaxi.com/en/spain.html",
    "https://www.livebeaches.com/spain/",
]

USER_AGENT = "Mozilla/5.0 (compatible; SpainBeachWebcamCrawler/1.0)"
REQUEST_DELAY_SECONDS = 1.5
TIMEOUT_SECONDS = 20
MAX_PAGES = 1500

OUTPUT_JSON = "spain_beach_webcams.json"
OUTPUT_CSV = "spain_beach_webcams.csv"

ALLOWED_DOMAINS = {
    "www.skylinewebcams.com",
    "skylinewebcams.com",
    "www.webcamtaxi.com",
    "webcamtaxi.com",
    "www.livebeaches.com",
    "livebeaches.com",
}

COASTAL_KEYWORDS = {
    "beach", "playa", "coast", "costa", "marina", "harbor", "harbour",
    "port", "surf", "bay", "seaside", "shore", "ocean", "sea",
    "canteras", "barceloneta", "las americas", "cala", "palmas",
    "mallorca", "ibiza", "tenerife", "lanzarote", "gran canaria",
    "cadiz", "marbella", "malaga", "benidorm", "la manga", "mojacar",
    "torrevieja", "calafell", "suances", "adeje", "teresitas"
}

EXCLUDE_KEYWORDS = {
    "ski", "mountain", "cathedral", "plaza", "airport", "street",
    "traffic", "church", "square", "museum", "station", "city center"
}

EMBED_PATTERNS = [
    r'https?://[^\s\'"]+\.m3u8',
    r'https?://[^\s\'"]+youtube\.com/embed/[^\s\'"]+',
    r'https?://[^\s\'"]+youtu\.be/[^\s\'"]+',
    r'https?://[^\s\'"]+\.mp4',
    r'https?://[^\s\'"]+\.jpg',
    r'https?://[^\s\'"]+\.jpeg',
    r'https?://[^\s\'"]+\.png',
]

REGION_HINTS = [
    "andalucia", "cataluna", "catalonia", "canarias", "canary islands",
    "islas baleares", "balearic islands", "valencia", "murcia",
    "cantabria", "galicia", "asturias", "basque country", "girona",
    "barcelona", "malaga", "cadiz", "alicante", "ibiza", "mallorca",
    "tenerife", "gran canaria", "lanzarote", "las palmas"
]


# =========================================================
# SESSION / ROBOTS
# =========================================================

session = requests.Session()
session.headers.update({"User-Agent": USER_AGENT})
_robot_cache = {}


def get_robot_parser(base_url: str):
    if base_url in _robot_cache:
        return _robot_cache[base_url]

    robots_url = urljoin(base_url, "/robots.txt")
    parser = robotparser.RobotFileParser()
    try:
        parser.set_url(robots_url)
        parser.read()
        _robot_cache[base_url] = parser
    except Exception:
        _robot_cache[base_url] = None
    return _robot_cache[base_url]


def can_fetch(url: str) -> bool:
    parsed = urlparse(url)
    base = f"{parsed.scheme}://{parsed.netloc}"
    parser = get_robot_parser(base)
    if parser is None:
        return True
    return parser.can_fetch(USER_AGENT, url)


# =========================================================
# HELPERS
# =========================================================

def normalize_url(base_url: str, href: str) -> str | None:
    if not href:
        return None
    href = href.strip()
    if href.startswith(("javascript:", "mailto:", "tel:")):
        return None
    return urljoin(base_url, href)


def same_allowed_domain(url: str) -> bool:
    try:
        return urlparse(url).netloc.lower() in ALLOWED_DOMAINS
    except Exception:
        return False


def fetch_html(url: str) -> str | None:
    if not can_fetch(url):
        print(f"[robots blocked] {url}")
        return None

    try:
        time.sleep(REQUEST_DELAY_SECONDS)
        response = session.get(url, timeout=TIMEOUT_SECONDS)
        if response.status_code == 200 and "text/html" in response.headers.get("Content-Type", ""):
            return response.text
        return None
    except Exception as error:
        print(f"[fetch error] {url} -> {error}")
        return None


def soup_title(soup: BeautifulSoup) -> str:
    if soup.title and soup.title.string:
        return soup.title.string.strip()
    h1 = soup.find("h1")
    if h1:
        return h1.get_text(" ", strip=True)
    return ""


def page_text(soup: BeautifulSoup) -> str:
    return soup.get_text(" ", strip=True).lower()


def contains_any(text: str, words: set[str]) -> bool:
    return any(word in text for word in words)


def is_spain_related(url: str, title: str, text: str) -> bool:
    blob = f"{url} {title} {text}".lower()
    return "spain" in blob or "espana" in blob or "/spain/" in url.lower() or "/espana/" in url.lower()


def is_coastal_page(url: str, title: str, text: str) -> bool:
    blob = f"{url} {title} {text}".lower()
    has_good = contains_any(blob, COASTAL_KEYWORDS)
    has_bad = contains_any(blob, EXCLUDE_KEYWORDS)
    return has_good and not has_bad


def extract_region_hint(url: str, title: str, text: str) -> str:
    blob = f"{url} {title} {text}".lower()
    hits = [region for region in REGION_HINTS if region in blob]
    deduped = []
    for hit in hits:
      if hit not in deduped:
        deduped.append(hit)
    return ", ".join(deduped[:3])


def extract_embed_urls(soup: BeautifulSoup, page_url: str) -> list[str]:
    found = set()

    for tag in soup.find_all(["iframe", "video", "source", "img"]):
        src = tag.get("src") or tag.get("data-src") or tag.get("poster")
        if src:
            full = normalize_url(page_url, src)
            if full:
                lowered = full.lower()
                if any(token in lowered for token in ["youtube", ".m3u8", ".mp4", "webcam", "cam", ".jpg", ".jpeg", ".png"]):
                    found.add(full)

    raw = str(soup)
    for pattern in EMBED_PATTERNS:
        for match in re.findall(pattern, raw, flags=re.IGNORECASE):
            found.add(match)

    return sorted(found)


def extract_links(soup: BeautifulSoup, page_url: str) -> list[str]:
    links = set()
    for anchor in soup.find_all("a", href=True):
        href = normalize_url(page_url, anchor["href"])
        if not href or not same_allowed_domain(href):
            continue
        links.add(href)
    return sorted(links)


def looks_like_detail_page(url: str, title: str, text: str) -> bool:
    blob = f"{url} {title} {text}".lower()
    detail_signals = [
        "live cam", "live webcam", "webcam", "beach cam", "beach webcam",
        "playa", "marina", "surf", "harbor", "harbour", "cala"
    ]
    return any(signal in blob for signal in detail_signals)


# =========================================================
# CRAWLER
# =========================================================

def crawl_spain_beach_webcams(seed_urls: list[str], max_pages: int = 1500) -> list[dict]:
    queue = deque(seed_urls)
    seen = set()
    results = []

    while queue and len(seen) < max_pages:
        url = queue.popleft()
        if url in seen:
            continue
        seen.add(url)

        if not same_allowed_domain(url):
            continue

        print(f"[visit] {url}")
        html = fetch_html(url)
        if not html:
            continue

        soup = BeautifulSoup(html, "lxml")
        title = soup_title(soup)
        text = page_text(soup)

        if is_spain_related(url, title, text) and is_coastal_page(url, title, text) and looks_like_detail_page(url, title, text):
            record = {
                "title": title,
                "region_hint": extract_region_hint(url, title, text),
                "page_url": url,
                "embed_urls": extract_embed_urls(soup, url),
                "source_site": urlparse(url).netloc.lower(),
            }
            results.append(record)
            print(f"  [saved] {title}")

        for link in extract_links(soup, url):
            lowered = link.lower()
            if (
                "/espana" in lowered or "/spain" in lowered or
                "spain.html" in lowered or "espana.html" in lowered or
                any(term in lowered for term in [
                    "barcelona", "girona", "cadiz", "malaga", "ibiza", "mallorca",
                    "tenerife", "lanzarote", "canarias", "las-palmas", "gran-canaria",
                    "alicante", "murcia", "valencia", "cantabria", "asturias"
                ])
            ):
                if link not in seen:
                    queue.append(link)

    return dedupe_results(results)


def dedupe_results(results: list[dict]) -> list[dict]:
    merged = {}
    for item in results:
        key = item["page_url"].strip().lower()
        if key not in merged:
            merged[key] = item
        else:
            prior = merged[key]
            prior["embed_urls"] = sorted(set(prior.get("embed_urls", [])) | set(item.get("embed_urls", [])))

            if not prior.get("region_hint") and item.get("region_hint"):
                prior["region_hint"] = item["region_hint"]

            if len(item.get("title", "")) > len(prior.get("title", "")):
                prior["title"] = item["title"]

    return list(merged.values())


# =========================================================
# SAVE
# =========================================================

def save_json(records: list[dict], path: str) -> None:
    with open(path, "w", encoding="utf-8") as file_handle:
        json.dump(records, file_handle, indent=2, ensure_ascii=False)


def save_csv(records: list[dict], path: str) -> None:
    with open(path, "w", newline="", encoding="utf-8") as file_handle:
        writer = csv.DictWriter(
            file_handle,
            fieldnames=["title", "region_hint", "page_url", "embed_urls", "source_site"]
        )
        writer.writeheader()
        for record in records:
            row = dict(record)
            row["embed_urls"] = " | ".join(record.get("embed_urls", []))
            writer.writerow(row)


if __name__ == "__main__":
    records = crawl_spain_beach_webcams(SEED_URLS, max_pages=MAX_PAGES)
    records = sorted(records, key=lambda item: (item.get("region_hint", ""), item.get("title", "")))

    save_json(records, OUTPUT_JSON)
    save_csv(records, OUTPUT_CSV)

    print(f"\nSaved {len(records)} records")
    print(f"JSON: {OUTPUT_JSON}")
    print(f"CSV : {OUTPUT_CSV}")
