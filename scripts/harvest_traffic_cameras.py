import json
import os
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests


USER_AGENT = "USWebcamMonitorTrafficHarvester/1.0"
DEFAULT_OUTPUT = Path("data/generated/traffic_cameras.geojson")
DEFAULT_WSDOT_API_URL = (
    "https://wsdot.wa.gov/Traffic/api/HighwayCameras/"
    "HighwayCamerasREST.svc/GetHighwayCamerasAsJson"
)
DEFAULT_GA511_ENDPOINT = "https://511ga.org/api/v2/get/cameras"


@dataclass
class CameraRecord:
    source: str
    state: str
    camera_id: str
    title: str
    description: str
    latitude: float
    longitude: float
    image_url: str
    page_url: str
    status: str
    raw: Dict[str, Any]


class BaseAdapter:
    name = "base"
    state = "XX"

    def fetch(self) -> List[CameraRecord]:
        raise NotImplementedError


def request_json(url: str, *, params: Optional[Dict[str, str]] = None) -> Any:
    response = requests.get(
        url,
        params=params,
        headers={"User-Agent": USER_AGENT},
        timeout=30,
    )
    response.raise_for_status()
    return response.json()


def as_float(value: Any) -> Optional[float]:
    if isinstance(value, (float, int)):
        return float(value)
    if isinstance(value, str):
        try:
            parsed = float(value)
        except ValueError:
            return None
        return parsed
    return None


def as_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def extract_list(payload: Any, *keys: str) -> List[Dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]

    if not isinstance(payload, dict):
        return []

    for key in keys:
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]

    return []


class WSDOTAdapter(BaseAdapter):
    name = "WSDOT"
    state = "WA"

    def __init__(self, access_code: str, api_url: Optional[str] = None):
        self.access_code = access_code
        self.api_url = api_url or DEFAULT_WSDOT_API_URL

    def fetch(self) -> List[CameraRecord]:
        payload = request_json(self.api_url, params={"AccessCode": self.access_code})
        items = extract_list(
            payload,
            "Cameras",
            "GetHighwayCamerasAsJsonResult",
            "value",
        )

        cameras: List[CameraRecord] = []

        for item in items:
            lat = as_float(
                item.get("DisplayLatitude")
                or item.get("Latitude")
                or item.get("latitude")
            )
            lon = as_float(
                item.get("DisplayLongitude")
                or item.get("Longitude")
                or item.get("longitude")
            )
            if lat is None or lon is None:
                continue

            camera_id = as_text(item.get("CameraID") or item.get("CameraId") or item.get("ID"))
            title = as_text(item.get("Title") or item.get("Name") or item.get("Description"))
            if not title:
                continue

            description = as_text(item.get("Description") or item.get("RouteName"))
            image_url = as_text(item.get("ImageURL") or item.get("ImageUrl") or item.get("imageUrl"))
            is_active = item.get("IsActive")
            status = "online" if is_active is True else "unknown"
            page_url = (
                as_text(item.get("Url") or item.get("Link") or item.get("PageUrl"))
                or f"https://wsdot.com/travel/real-time/camera/{camera_id}"
            )

            cameras.append(
                CameraRecord(
                    source=self.name,
                    state=self.state,
                    camera_id=camera_id or f"{lat},{lon}",
                    title=title,
                    description=description,
                    latitude=lat,
                    longitude=lon,
                    image_url=image_url,
                    page_url=page_url,
                    status=status,
                    raw=item,
                )
            )

        return cameras


class GA511Adapter(BaseAdapter):
    """
    Optional 511 Georgia template.

    Keep this adapter disabled until the account-specific endpoint and payload
    are confirmed against live developer credentials.
    """

    name = "511GA"
    state = "GA"

    def __init__(self, api_key: str, endpoint: Optional[str] = None):
        self.api_key = api_key
        self.endpoint = endpoint or DEFAULT_GA511_ENDPOINT

    def fetch(self) -> List[CameraRecord]:
        payload = request_json(self.endpoint, params={"key": self.api_key})
        items = extract_list(payload, "cameras", "data", "items")

        cameras: List[CameraRecord] = []

        for item in items:
            lat = as_float(item.get("latitude") or item.get("lat"))
            lon = as_float(item.get("longitude") or item.get("lon") or item.get("lng"))
            if lat is None or lon is None:
                continue

            camera_id = as_text(item.get("id") or item.get("camera_id"))
            title = as_text(item.get("name") or item.get("title"))
            if not title:
                continue

            description = as_text(item.get("description"))
            image_url = as_text(item.get("imageUrl") or item.get("image_url"))
            page_url = as_text(item.get("url") or item.get("page_url")) or "https://511ga.org/"
            status = as_text(item.get("status")).lower() or "unknown"

            cameras.append(
                CameraRecord(
                    source=self.name,
                    state=self.state,
                    camera_id=camera_id or f"{lat},{lon}",
                    title=title,
                    description=description,
                    latitude=lat,
                    longitude=lon,
                    image_url=image_url,
                    page_url=page_url,
                    status=status,
                    raw=item,
                )
            )

        # Respect documented throttling guidance if enabled.
        time.sleep(6.5)
        return cameras


def dedupe_cameras(cameras: List[CameraRecord]) -> List[CameraRecord]:
    seen = set()
    deduped: List[CameraRecord] = []

    for camera in cameras:
        key = (
            camera.source,
            camera.camera_id,
            round(camera.latitude, 6),
            round(camera.longitude, 6),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(camera)

    return deduped


def cameras_to_geojson(cameras: List[CameraRecord]) -> Dict[str, Any]:
    features = []

    for camera in cameras:
        properties = asdict(camera)
        properties.pop("latitude", None)
        properties.pop("longitude", None)

        features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [camera.longitude, camera.latitude],
                },
                "properties": properties,
            }
        )

    return {"type": "FeatureCollection", "features": features}


def save_geojson(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)


def main() -> None:
    all_cameras: List[CameraRecord] = []
    adapters: List[BaseAdapter] = []

    wsdot_access_code = os.getenv("WSDOT_ACCESS_CODE", "").strip()
    if wsdot_access_code:
        adapters.append(
            WSDOTAdapter(
                access_code=wsdot_access_code,
                api_url=os.getenv("WSDOT_API_URL", "").strip() or None,
            )
        )
    else:
        print("Skipping WSDOT: WSDOT_ACCESS_CODE is not set")

    ga511_api_key = os.getenv("GA511_API_KEY", "").strip()
    if ga511_api_key:
        adapters.append(
            GA511Adapter(
                api_key=ga511_api_key,
                endpoint=os.getenv("GA511_API_URL", "").strip() or None,
            )
        )
    else:
        print("Skipping 511GA: GA511_API_KEY is not set")

    if not adapters:
        print("No traffic adapters were enabled. Set WSDOT_ACCESS_CODE and/or GA511_API_KEY.")
        return

    for adapter in adapters:
        try:
            print(f"Fetching cameras from {adapter.name}...")
            cameras = adapter.fetch()
            print(f"  got {len(cameras)} cameras")
            all_cameras.extend(cameras)
        except Exception as error:
            print(f"  FAILED for {adapter.name}: {error}")

    deduped = dedupe_cameras(all_cameras)
    output_path = Path(os.getenv("TRAFFIC_CAMERA_OUTPUT", DEFAULT_OUTPUT))
    save_geojson(output_path, cameras_to_geojson(deduped))
    print(f"Saved {len(deduped)} cameras to {output_path}")


if __name__ == "__main__":
    main()
