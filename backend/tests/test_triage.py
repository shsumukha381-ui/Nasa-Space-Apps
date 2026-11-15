import json
import unittest
from unittest.mock import patch

import requests

from nasa import DONKI_URL, OSDR_METADATA_URL, NasaReferenceError, fetch_nasa_reference
from triage import assess_environment, assess_telemetry, protocol_as_text


class TriageTests(unittest.TestCase):
    def setUp(self):
        self.vitals = {
            "heart_rate": 100,
            "spo2": 95,
            "bp_sys": 139,
            "bp_dia": 89,
            "ultrasound_status": "Clear",
        }

    def test_threshold_boundaries_and_severity(self):
        self.assertIsNone(assess_telemetry(self.vitals, []))
        cases = (
            ({"spo2": 94}, "hypoxia", "WARNING"),
            ({"spo2": 89}, "hypoxia", "CRITICAL"),
            ({"heart_rate": 120}, "tachycardia", "CRITICAL"),
            ({"bp_sys": 140}, "hypertension", "WARNING"),
            ({"bp_dia": 90}, "hypertension", "WARNING"),
            ({"ultrasound_status": "Optic Disc Edema Detected"}, "edema", "WARNING"),
            ({"bone_status": "Bone Density Loss Detected"}, "bone_loss", "WARNING"),
        )
        for change, flag, severity in cases:
            with self.subTest(change=change):
                protocol = assess_telemetry(self.vitals | change, [])
                self.assertEqual(protocol["flags"], [flag])
                self.assertEqual(protocol["severity"], severity)
                self.assertEqual([step["n"] for step in protocol["steps"]], list(range(1, len(protocol["steps"]) + 1)))
                self.assertIn(protocol["headline"], protocol_as_text(protocol))

    def test_item_snapshot_does_not_replace_unavailable_supply(self):
        item = {
            "name": "Supplemental O2 Tanks",
            "qty": 0,
            "location": "Medical storage",
            "potency_loss_pct": 0.0,
            "status": "out",
            "warning": "Out of stock",
        }
        unrelated_item = {**item, "name": "Supplemental O2 Tanks Training", "qty": 10}
        protocol = assess_telemetry(self.vitals | {"spo2": 89}, [unrelated_item, item])
        item["qty"] = 1
        snapshot = protocol["steps"][0]["item"]
        self.assertEqual(snapshot["qty"], 0)
        self.assertEqual(snapshot["status"], "out")
        self.assertIn("0 remaining", protocol_as_text(protocol))

    def test_environment_nominal_and_combined_limits(self):
        self.assertIsNone(assess_environment({"co2": 3500, "radiation": 70}))
        protocol = assess_environment({"co2": 3501, "radiation": 71})
        self.assertEqual(protocol["headline"], "Severe Hypercapnia + Radiation Storm")
        self.assertEqual(protocol["flags"], ["hypercapnia", "radiation_spike"])
        self.assertEqual([step["n"] for step in protocol["steps"]], [1, 2])
        self.assertEqual(assess_environment({"co2": 1500, "radiation": 71})["flags"], ["radiation_spike"])


class FakeResponse:
    def __init__(self, payload, status_code=200, *, raw=False):
        self.body = payload if raw else json.dumps(payload).encode("utf-8")
        self.status_code = status_code

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def iter_content(self, **_):
        yield self.body


class NasaTests(unittest.TestCase):
    @patch("nasa.requests.get")
    def test_historical_results_and_partial_osdr_failure(self, get):
        get.side_effect = [
            FakeResponse([{"activityID": "2024-05-09T02:48:00-CME-001"}]),
            FakeResponse({"study": {"OSD-288": {}}}),
            FakeResponse({"study": {}}, status_code=404),
        ]
        result = fetch_nasa_reference("test-key")
        self.assertTrue(result["historical"])
        self.assertEqual(result["window"], {"start": "2024-05-08", "end": "2024-05-11"})
        self.assertEqual(result["cme_count"], 1)
        self.assertNotIn("CME detected", result["status"])
        self.assertEqual(result["studies"], [
            {"id": "OSD-288", "status": "available"},
            {"id": "OSD-817", "status": "unavailable"},
        ])
        calls = get.call_args_list
        self.assertEqual(calls[0].args, (DONKI_URL,))
        self.assertEqual(calls[0].kwargs["params"]["api_key"], "test-key")
        self.assertFalse(calls[0].kwargs["allow_redirects"])
        self.assertEqual(calls[1].args, (f"{OSDR_METADATA_URL}/288",))
        self.assertIsNone(calls[1].kwargs["params"])

    @patch("nasa.requests.get")
    def test_empty_historical_results_are_valid(self, get):
        get.return_value = FakeResponse([])
        self.assertEqual(fetch_nasa_reference()["cme_count"], 0)

    @patch("nasa.requests.get")
    def test_upstream_errors_are_bounded_and_hide_the_query(self, get):
        for invalid in (
            FakeResponse({}, status_code=302),
            FakeResponse({"error": "429 limit exceeded"}),
            FakeResponse([{"wrong_field": "data"}]),
            FakeResponse(b"not JSON", raw=True),
            FakeResponse(b"x" * (2 * 1024 * 1024 + 1), raw=True),
            requests.ConnectionError("https://api.nasa.gov/DONKI/CME?api_key=secret-key"),
        ):
            with self.subTest(upstream=type(invalid)):
                get.reset_mock()
                get.side_effect = [invalid]
                with self.assertRaises(NasaReferenceError) as caught:
                    fetch_nasa_reference()
                self.assertNotIn("secret-key", str(caught.exception))
                self.assertEqual(get.call_count, 1)


if __name__ == "__main__":
    unittest.main()
