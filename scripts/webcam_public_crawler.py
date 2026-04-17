import csv
import json
import re
import time
from urllib import robotparser
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

# -----------------------------
# CONFIG
# -----------------------------
SEED_URLS = [
    "https://www.livebeaches.com/spain/",
    "https://www.webcamtaxi.com/en/spain.html",
    "https://www.skylinewebcams.com/en/webcam/espana.html",
]

USER_AGENT = "Mozilla/5.0 (compatible; PublicWebcamIndexer/1.0; +https://example.com/bot)"
REQUEST_DELAY_SECONDS = 2.0
TIMEOUT_SECONDS = 20
MAX_PAGES = 200

OUTPUT_JSON = "webcams_public.json"
OUTPUT_CSV = "webcams_public.csv"

WEBCAM_KEYWORDS = [
    "webcam", "live cam", "livecam", "camera", "beach cam", "surf cam", "traffic cam"
]

EMBED_HINTS = [
    "youtube.com/embed",
    "youtube.com/live",
    "youtu.be/",
    "player.",
    "webcam",
    ".m3u8",
    ".mp4",
    ".jpg",
    ".jpeg",
    ".png",
    "earthcam",
    "skylinewebcams",
]

session = requests.Session()
session.headers.update({"User-Agent": USER_AGENT})


# -----------------------------
# ROBOTS.TXT SUPPORT
# -----------------------------
_robot_cache = {}


def can_fetch(url: str) -> bool:
    parsed = urlparse(url)
    base = f"{parsed.scheme}://{parsed.netloc}"
    robots_url = urljoin(base, "/robots.txt")

    if base not in _robot_cache:
        rp = robotparser.RobotFileParser()
        try:
            rp.set_url(robots_url)
            rp.read()
            _robot_cache[base] = rp
        except Exception:
            _robot_cache[base] = None

    rp = _robot_cache[base]
    if rp is None:
        return True
    return rp.can_fetch(USER_AGENT, url)


# -----------------------------
# HELPERS
# -----------------------------
def fetch(url: str) -> str | None:
    if not can_fetch(url):
        print(f"[robots-blocked] {url}")
        return None

    try:
        time.sleep(REQUEST_DELAY_SECONDS)
        response = session.get(url, timeout=TIMEOUT_SECONDS)
        if response.status_code == 200 and "text/html" in response.headers.get("Content-Type", ""):
            return response.text
        print(f"[skip] {url} status={response.status_code} content_type={response.headers.get('Content-Type')}")
        return None
    except Exception as error:
        print(f"[error] fetch failed for {url}: {error}")
        return None


def normalize_url(base_url: str, href: str) -> str | None:
    if not href:
        return None
    href = href.strip()
    if href.startswith(("javascript:", "mailto:", "tel:")):
        return None
    return urljoin(base_url, href)


def looks_like_webcam_text(text: str) -> bool:
    normalized = (text or "").strip().lower()
    return any(keyword in normalized for keyword in WEBCAM_KEYWORDS)


def looks_like_webcam_url(url: str) -> bool:
    normalized = (url or "").lower()
    return any(keyword in normalized for keyword in ["webcam", "livecam", "camera", "cam", "traffic", "beach"])


def extract_title(soup: BeautifulSoup) -> str:
    if soup.title and soup.title.string:
        return soup.title.string.strip()
    h1 = soup.find("h1")
    return h1.get_text(" ", strip=True) if h1 else ""


def extract_location_hint(url: str, title: str) -> str:
    text = f"{title} {url}".lower()
    known_places = [
        "barcelona", "mallorca", "valencia", "gran canaria", "lanzarote",
        "ibiza", "malaga", "marbella", "tenerife", "bilbao", "asturias",
        "tehran", "shiraz", "mashhad", "ahvaz", "qom", "bushehr", "iran", "spain"
    ]
    hits = [place for place in known_places if place in text]
    return ", ".join(hits[:3])


def extract_embeds(soup: BeautifulSoup, page_url: str) -> list[str]:
    found = set()

    for tag in soup.find_all(["iframe", "video", "source", "img"]):
        src = tag.get("src") or tag.get("data-src") or tag.get("poster")
        if src:
            full = normalize_url(page_url, src)
            if full and any(hint in full.lower() for hint in EMBED_HINTS):
                found.add(full)

    raw_html = str(soup)
    stream_patterns = [
        r'https?://[^\s\'"]+\.m3u8',
        r'https?://[^\s\'"]+youtube\.com/embed/[^\s\'"]+',
        r'https?://[^\s\'"]+youtu\.be/[^\s\'"]+',
        r'https?://[^\s\'"]+\.mp4',
        r'https?://[^\s\'"]+\.jpg',
        r'https?://[^\s\'"]+\.jpeg',
        r'https?://[^\s\'"]+\.png',
    ]
    for pattern in stream_patterns:
        for match in re.findall(pattern, raw_html, flags=re.IGNORECASE):
            found.add(match)

    return sorted(found)


def extract_candidate_links(soup: BeautifulSoup, page_url: str) -> list[str]:
    links = set()
    for anchor in soup.find_all("a", href=True):
        href = normalize_url(page_url, anchor["href"])
        if not href:
            continue

        link_text = anchor.get_text(" ", strip=True)
        if looks_like_webcam_text(link_text) or looks_like_webcam_url(href):
            links.add(href)

    return sorted(links)


def page_has_webcam_signals(soup: BeautifulSoup, url: str) -> bool:
    text = soup.get_text(" ", strip=True).lower()
    if any(keyword in text for keyword in WEBCAM_KEYWORDS):
        return True
    if extract_embeds(soup, url):
        return True
    return False


# -----------------------------
# CRAWLER
# -----------------------------
def crawl(seed_urls: list[str], max_pages: int = 200) -> list[dict]:
    queue = list(seed_urls)
    seen = set()
    results = []

    while queue and len(seen) < max_pages:
        url = queue.pop(0)
        if url in seen:
            continue
        seen.add(url)

        print(f"[visit] {url}")
        html = fetch(url)
        if not html:
            continue

        soup = BeautifulSoup(html, "html.parser")
        title = extract_title(soup)

        if page_has_webcam_signals(soup, url):
            embeds = extract_embeds(soup, url)
            record = {
                "title": title,
                "page_url": url,
                "location_hint": extract_location_hint(url, title),
                "embed_urls": embeds,
            }
            results.append(record)
            print(f"  [webcam-page] {title}")

        for candidate in extract_candidate_links(soup, url):
            if candidate not in seen and candidate not in queue:
                queue.append(candidate)

    return dedupe_results(results)


def dedupe_results(results: list[dict]) -> list[dict]:
    unique = {}
    for record in results:
        key = record["page_url"].strip().lower()
        if key not in unique:
            unique[key] = record
        else:
            merged = set(unique[key].get("embed_urls", [])) | set(record.get("embed_urls", []))
            unique[key]["embed_urls"] = sorted(merged)
    return list(unique.values())


# -----------------------------
# SAVE
# -----------------------------
def save_json(records: list[dict], path: str) -> None:
    with open(path, "w", encoding="utf-8") as file_handle:
        json.dump(records, file_handle, indent=2, ensure_ascii=False)


def save_csv(records: list[dict], path: str) -> None:
    with open(path, "w", newline="", encoding="utf-8") as file_handle:
        writer = csv.DictWriter(
            file_handle,
            fieldnames=["title", "page_url", "location_hint", "embed_urls"]
        )
        writer.writeheader()
        for record in records:
            row = dict(record)
            row["embed_urls"] = " | ".join(record.get("embed_urls", []))
            writer.writerow(row)


if __name__ == "__main__":
    records = crawl(SEED_URLS, max_pages=MAX_PAGES)
    print(f"\nFound {len(records)} public webcam pages")
    save_json(records, OUTPUT_JSON)
    save_csv(records, OUTPUT_CSV)
    print(f"Saved to {OUTPUT_JSON} and {OUTPUT_CSV}")
