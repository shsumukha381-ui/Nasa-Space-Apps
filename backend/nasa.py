"""Read-only NASA references for the dashboard's historical scenario."""

import json
from time import monotonic
from typing import Any

import requests


START_DATE = "2024-05-08"
END_DATE = "2024-05-11"
DONKI_URL = "https://api.nasa.gov/DONKI/CME"
OSDR_METADATA_URL = "https://osdr.nasa.gov/osdr/data/osd/meta"
OSDR_ACCESSIONS = (288, 817)
MAX_RESPONSE_BYTES = 2 * 1024 * 1024


class NasaReferenceError(Exception):
    """A historical reference could not be verified with its provider."""


def _get_json(url: str, timeout_seconds: float, *, params: dict[str, str] | None = None) -> Any:
    deadline = monotonic() + timeout_seconds
    try:
        with requests.get(
            url,
            params=params,
            headers={"Accept": "application/json"},
            timeout=(min(2.0, timeout_seconds), timeout_seconds),
            allow_redirects=False,
            stream=True,
        ) as response:
            if not 200 <= response.status_code < 300:
                raise NasaReferenceError("The reference service rejected the request.")

            body = bytearray()
            for chunk in response.iter_content(chunk_size=16 * 1024):
                if monotonic() >= deadline or len(body) + len(chunk) > MAX_RESPONSE_BYTES:
                    raise NasaReferenceError("The reference response exceeded its download limits.")
                body.extend(chunk)

            return json.loads(body)
    except (requests.RequestException, ValueError, RecursionError):
        # Request exceptions may contain the DONKI URL and its API key.
        raise NasaReferenceError("The reference service did not return a usable response.") from None


def _study_reference(accession: int, timeout_seconds: float) -> dict[str, str]:
    study_id = f"OSD-{accession}"
    try:
        payload = _get_json(f"{OSDR_METADATA_URL}/{accession}", timeout_seconds)
    except NasaReferenceError:
        return {"id": study_id, "status": "unavailable"}

    studies = payload.get("study") if isinstance(payload, dict) else None
    available = isinstance(studies, dict) and isinstance(studies.get(study_id), dict)
    return {"id": study_id, "status": "available" if available else "unavailable"}


def fetch_nasa_reference(api_key: str | None = None, timeout_seconds: float = 4.0) -> dict[str, Any]:
    """Fetch historical metadata without modifying telemetry, environment, or alerts."""
    try:
        events = _get_json(
            DONKI_URL,
            timeout_seconds,
            params={"startDate": START_DATE, "endDate": END_DATE, "api_key": api_key or "DEMO_KEY"},
        )
        if not isinstance(events, list) or any(
            not isinstance(event, dict) or not isinstance(event.get("activityID"), str)
            for event in events
        ):
            raise NasaReferenceError("The historical event list was not in the expected format.")
    except NasaReferenceError:
        raise NasaReferenceError("The backend could not verify the historical NASA DONKI records.") from None

    studies = [_study_reference(accession, timeout_seconds) for accession in OSDR_ACCESSIONS]
    available_studies = sum(study["status"] == "available" for study in studies)
    noun = "record" if len(events) == 1 else "records"
    return {
        "status": (
            f"May 8–11, 2024 historical NASA reference. DONKI returned {len(events)} CME {noun}. "
            f"OSDR metadata was available for {available_studies} of {len(studies)} studies."
        ),
        "historical": True,
        "window": {"start": START_DATE, "end": END_DATE},
        "cme_count": len(events),
        "studies": studies,
    }
