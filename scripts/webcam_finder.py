import argparse
import csv
import ipaddress
import re
import time
from collections import deque
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; SitDeckBot/1.0; +https://example.com/bot)"
}

DEFAULT_SEED_URLS = [
    "https://www.dot.state.mn.us/cameras/",
    "https://www.weatherbug.com/weather-camera/",
    "https://www.nps.gov/subjects/webcams/index.htm",
    "https://www.surfline.com/surf-cams",
]

COMMON_PATTERNS = [
    r"mjpg/video\.mjpg",
    r"video\.mjpg",
    r"mjpeg",
    r"axis-cgi/mjpg/video\.cgi",
    r"cgi-bin/mjpg/video\.cgi",
    r"video\.cgi",
    r"\.m3u8(\?.*)?$",
    r"live/playlist\.m3u8",
    r"live/stream\.m3u8",
    r"master\.m3u8",
    r"live\.jpg",
    r"current\.jpg",
    r"snapshot\.jpg",
    r"webcam\.jpg",
    r"image\.jpg",
    r"jpg/image\.jpg",
    r"/webcam/video\.mjpg",
    r"/cam\d+",
    r"/camera/",
    r"/webcam/",
    r"/livecam/",
    r"/live(?:/|$)",
    r"/stream(?:/|$)",
]

HTML_LINK_HINTS = ("/camera/", "/webcam/", "/cam/", "/livecam/", "/live", "/stream")


def same_domain(url1, url2):
    return urlparse(url1).netloc == urlparse(url2).netloc


def is_public_candidate(url):
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return False

    hostname = parsed.hostname
    if not hostname:
        return False

    lowered = hostname.lower()
    if lowered in {"localhost"} or lowered.endswith(".local"):
        return False

    try:
        ip = ipaddress.ip_address(hostname)
        return not (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
        )
    except ValueError:
        return True


def is_html_response(response):
    content_type = response.headers.get("Content-Type", "").lower()
    return "text/html" in content_type


def looks_like_stream(url):
    lowered = url.lower()
    return any(re.search(pattern, lowered) for pattern in COMMON_PATTERNS)


def looks_like_camera_page(url):
    lowered = url.lower()
    return any(token in lowered for token in HTML_LINK_HINTS)


def classify_url(url, content_type=""):
    lowered_url = url.lower()
    lowered_content_type = content_type.lower()

    if ".m3u8" in lowered_url or "application/vnd.apple.mpegurl" in lowered_content_type:
        return "HLS"
    if "mjpg" in lowered_url or "multipart/x-mixed-replace" in lowered_content_type:
        return "MJPEG"
    if any(
        token in lowered_url
        for token in [
            "live.jpg",
            "current.jpg",
            "snapshot.jpg",
            "webcam.jpg",
            "image.jpg",
            ".jpeg",
            ".png",
        ]
    ) or "image/" in lowered_content_type:
        return "IMAGE"
    if "iframe" in lowered_url or "youtube.com/embed/" in lowered_url:
        return "IFRAME"
    return "UNKNOWN"


def normalize_url(base, link):
    if not link:
        return None
    return urljoin(base, link.strip())


def test_candidate(url, request_timeout):
    try:
        response = requests.head(
            url,
            headers=HEADERS,
            timeout=request_timeout,
            allow_redirects=True,
        )
        content_type = response.headers.get("Content-Type", "")
        if response.status_code < 400:
            return {
                "ok": True,
                "status_code": response.status_code,
                "content_type": content_type,
                "stream_type": classify_url(url, content_type),
            }
    except requests.RequestException:
        pass

    try:
        response = requests.get(
            url,
            headers=HEADERS,
            timeout=request_timeout,
            stream=True,
            allow_redirects=True,
        )
        content_type = response.headers.get("Content-Type", "")
        ok = response.status_code < 400
        response.close()
        return {
            "ok": ok,
            "status_code": response.status_code,
            "content_type": content_type,
            "stream_type": classify_url(url, content_type),
        }
    except requests.RequestException:
        return {
            "ok": False,
            "status_code": None,
            "content_type": "",
            "stream_type": "UNKNOWN",
        }


def extract_candidates_from_html(base_url, html):
    soup = BeautifulSoup(html, "html.parser")
    candidates = set()
    page_links = set()

    for tag in soup.find_all(["a", "img", "source", "video", "iframe"]):
        for attr in ["href", "src", "data-src"]:
            value = tag.get(attr)
            if not value:
                continue

            full_url = normalize_url(base_url, value)
            if not full_url:
                continue

            if looks_like_stream(full_url) and is_public_candidate(full_url):
                candidates.add(full_url)

            parsed = urlparse(full_url)
            if parsed.scheme in ["http", "https"] and is_public_candidate(full_url):
                page_links.add(full_url)
                if looks_like_camera_page(full_url):
                    candidates.add(full_url)

    raw_matches = re.findall(
        r'https?://[^\s\'"]+|/[^\s\'"]+\.(?:m3u8|jpg|jpeg|png)|/[^\s\'"]+(?:mjpg|mjpeg|video\.cgi)[^\s\'"]*',
        html,
        flags=re.IGNORECASE,
    )
    for match in raw_matches:
        full_url = normalize_url(base_url, match)
        if full_url and looks_like_stream(full_url) and is_public_candidate(full_url):
            candidates.add(full_url)

    return candidates, page_links


def crawl_site(
    seed_url,
    visited_pages,
    found_streams,
    results,
    max_pages,
    max_depth,
    request_timeout,
    sleep_between_requests,
):
    queue = deque([(seed_url, 0)])
    pages_processed = 0

    while queue and pages_processed < max_pages:
        current_url, depth = queue.popleft()

        if current_url in visited_pages or depth > max_depth:
            continue

        visited_pages.add(current_url)

        try:
            print(f"[PAGE] {current_url}")
            response = requests.get(
                current_url,
                headers=HEADERS,
                timeout=request_timeout,
                allow_redirects=True,
            )
            if response.status_code >= 400 or not is_html_response(response):
                continue

            pages_processed += 1
            candidates, links = extract_candidates_from_html(current_url, response.text)

            for candidate in candidates:
                if candidate in found_streams:
                    continue

                found_streams.add(candidate)
                test = test_candidate(candidate, request_timeout)
                result = {
                    "source_page": current_url,
                    "candidate_url": candidate,
                    "ok": test["ok"],
                    "status_code": test["status_code"],
                    "content_type": test["content_type"],
                    "stream_type": test["stream_type"],
                }
                results.append(result)
                print(
                    f"   [FOUND] {candidate} | {test['stream_type']} | ok={test['ok']}"
                )

            for link in links:
                if same_domain(seed_url, link) and link not in visited_pages:
                    queue.append((link, depth + 1))

            time.sleep(sleep_between_requests)
        except requests.RequestException:
            continue


def save_csv(results, filename):
    with open(filename, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "source_page",
                "candidate_url",
                "ok",
                "status_code",
                "content_type",
                "stream_type",
            ],
        )
        writer.writeheader()
        writer.writerows(results)

    print(f"\nSaved {len(results)} results to {filename}")


def parse_args():
    parser = argparse.ArgumentParser(
        description="Fallback webcam discovery crawler for public structured seed sites."
    )
    parser.add_argument(
        "--seed",
        action="append",
        dest="seeds",
        help="Seed URL to crawl. Can be provided multiple times.",
    )
    parser.add_argument(
        "--output",
        default="webcams_found.csv",
        help="CSV output path. Defaults to webcams_found.csv.",
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=200,
        help="Maximum pages to fetch per seed domain. Defaults to 200.",
    )
    parser.add_argument(
        "--max-depth",
        type=int,
        default=2,
        help="Maximum crawl depth from each seed page. Defaults to 2.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=10,
        help="Request timeout in seconds. Defaults to 10.",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=1.0,
        help="Delay between fetched HTML pages in seconds. Defaults to 1.0.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    seed_urls = args.seeds or DEFAULT_SEED_URLS

    visited_pages = set()
    found_streams = set()
    results = []

    for seed_url in seed_urls:
        crawl_site(
            seed_url=seed_url,
            visited_pages=visited_pages,
            found_streams=found_streams,
            results=results,
            max_pages=args.max_pages,
            max_depth=args.max_depth,
            request_timeout=args.timeout,
            sleep_between_requests=args.sleep,
        )

    save_csv(results, args.output)


if __name__ == "__main__":
    main()
