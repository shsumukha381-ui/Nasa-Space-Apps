"""Deterministic AstroTwin rules and the existing dashboard protocol format."""

from collections.abc import Mapping, Sequence
from typing import Any


InventoryItem = dict[str, Any]
ProtocolDraft = dict[str, Any]
TELEMETRY_SOURCE = "AstroTwin project telemetry rules"
ENVIRONMENT_SOURCE = "AstroTwin project environmental rules"


def _finding(label: str, value: str, state: str = "alert") -> dict[str, str]:
    return {"label": label, "value": value, "state": state}


def _step(
    title: str,
    action: str,
    item: InventoryItem | None = None,
) -> dict[str, Any]:
    return {"title": title, "action": action, "item": dict(item) if item is not None else None, "caution": None}


def _protocol(
    *, severity: str, headline: str, flags: list[str], findings: list[dict[str, str]],
    steps: list[dict[str, Any]], monitoring: list[str], escalation: str,
    source: str, rationale: str, rationale_status: str = "ready",
) -> ProtocolDraft:
    return {
        "severity": severity,
        "headline": headline,
        "findings": findings,
        "steps": [{"n": index, **step} for index, step in enumerate(steps, 1)],
        "monitoring": monitoring,
        "escalation": escalation,
        "source": source,
        "flags": flags,
        "rationale": rationale,
        "rationale_status": rationale_status,
    }


def assess_telemetry(
    vitals: Mapping[str, Any], inventory: Sequence[InventoryItem],
) -> ProtocolDraft | None:
    """Evaluate validated telemetry using the existing project alert thresholds."""
    heart_rate = vitals["heart_rate"]
    spo2 = vitals["spo2"]
    systolic = vitals["bp_sys"]
    diastolic = vitals["bp_dia"]
    hypoxia = spo2 < 95
    tachycardia = heart_rate > 100
    hypertension = systolic >= 140 or diastolic >= 90
    edema = vitals["ultrasound_status"] == "Optic Disc Edema Detected"
    bone_loss = vitals.get("bone_status") == "Bone Density Loss Detected"

    if not any((hypoxia, tachycardia, hypertension, edema, bone_loss)):
        return None

    names = []
    flags = ["bone_loss"] if bone_loss else []
    findings = [_finding("Bone density", "Resorption")] if bone_loss else []
    for active, flag, label, finding in (
        (hypoxia, "hypoxia", "low oxygen", _finding("SpO2", f"{spo2}%", "low")),
        (tachycardia, "tachycardia", "fast heart rate", _finding("Heart rate", f"{heart_rate} BPM", "high")),
        (hypertension, "hypertension", "high blood pressure", _finding("Blood pressure", f"{systolic}/{diastolic}", "high")),
        (edema, "edema", "optic disc swelling", _finding("Optic ultrasound", "Disc edema")),
    ):
        if active:
            names.append(label)
            flags.append(flag)
            findings.append(finding)
    if bone_loss:
        names.append("bone density loss")

    items = {item["name"].casefold(): item for item in inventory}
    steps = []
    monitoring = ["Record repeat vital signs and follow the Crew Medical Officer’s monitoring instructions."]
    rationale = []

    if hypoxia:
        steps.append(_step(
            "Review supplemental oxygen",
            "Verify the pulse oximeter reading and follow the approved onboard oxygen procedure under trained supervision.",
            items.get("supplemental o2 tanks"),
        ))
        rationale.append("The reported oxygen saturation crossed the project alert threshold.")

    if edema:
        steps.extend([
            _step(
                "Check fluid-shift equipment",
                "Have trained crew review the optic ultrasound and the approved fluid-shift procedure.",
                items.get("lbnp thigh cuff kit"),
            ),
            _step(
                "Review B-vitamin complex",
                "Confirm the existing care plan and available supplies with the Crew Medical Officer.",
                items.get("b-vitamin complex"),
            ),
            _step("Check cabin CO2", "Record the cabin CO2 reading for operations and medical review."),
        ])
        monitoring.append("Have trained crew review the optic ultrasound and determine any follow-up imaging.")
        rationale.append("The transmitted optic ultrasound status reported disc edema.")

    if bone_loss:
        steps.extend([
            _step(
                "Review bone countermeasure supplies",
                "Have the Crew Medical Officer review the current bone-health plan and resistive exercise records.",
                items.get("alendronate 10mg"),
            ),
            _step(
                "Review Vitamin D",
                "Confirm the existing supplementation plan with the Crew Medical Officer.",
                items.get("vitamin d 1000 iu"),
            ),
        ])
        monitoring.append("Record the bone scan and relevant resistive exercise measurements for review.")
        rationale.append("The transmitted bone scan status reported bone density loss.")

    if tachycardia or hypertension:
        steps.append(_step(
            "Recheck heart rate and blood pressure",
            "Verify the monitor and repeat the readings according to the approved onboard monitoring procedure.",
        ))
        rationale.append("The reported heart rate or blood pressure crossed a project alert threshold.")

    return _protocol(
        severity="CRITICAL" if spo2 < 90 or heart_rate >= 120 else "WARNING",
        headline=" + ".join(names).capitalize(),
        flags=flags,
        findings=findings,
        steps=steps,
        monitoring=monitoring,
        escalation="Notify the Crew Medical Officer promptly and follow the onboard escalation procedure.",
        source=TELEMETRY_SOURCE,
        rationale=" ".join(rationale),
        rationale_status="fallback",
    )


def assess_environment(inputs: Mapping[str, float]) -> ProtocolDraft | None:
    """Evaluate environmental inputs separately from crew vital signs."""
    flags = []
    names = []
    findings = []
    steps = []
    monitoring = []

    if inputs["co2"] > 3500:
        flags.append("hypercapnia")
        names.append("Severe Hypercapnia")
        findings.append(_finding("Cabin CO2", f"{inputs['co2']:g} ppm"))
        steps.append(_step(
            "Check cabin ventilation",
            "Notify habitat operations and follow the approved response for elevated cabin CO2.",
        ))
        monitoring.append("Log cabin CO2 and confirm the reading with habitat operations.")

    if inputs["radiation"] > 70:
        flags.append("radiation_spike")
        names.append("Radiation Storm")
        findings.append(_finding("Radiation", f"{inputs['radiation']:g} idx"))
        steps.append(_step(
            "Review radiation shelter procedure",
            "Notify mission operations and follow the approved onboard radiation response.",
        ))
        monitoring.append("Check the modeled radiation index against onboard sensor readings.")

    if not flags:
        return None

    return _protocol(
        severity="CRITICAL",
        headline=" + ".join(names),
        flags=flags,
        findings=findings,
        steps=steps,
        monitoring=monitoring,
        escalation="Notify mission operations and follow the approved onboard environmental response.",
        source=ENVIRONMENT_SOURCE,
        rationale="The environmental values crossed the configured project alert limits.",
    )


def protocol_as_text(protocol: Mapping[str, Any]) -> str:
    """Keep the existing simulator's plain-text protocol summary."""
    lines = [f"{protocol['severity']}: {protocol['headline']}"]
    for index, step in enumerate(protocol["steps"], 1):
        lines.append(f"{step.get('n', index)}. {step['title']} - {step['action']}")
        if item := step.get("item"):
            lines.append(
                f"   {item['name']} | {item['qty']} remaining | {item['location']}"
                f" | potency -{item['potency_loss_pct']}%"
            )
    return "\n".join(lines)
