
from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import re
import time
import itertools
import threading
import requests
import chromadb
from sqlalchemy import create_engine, Column, Integer, String, Float
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import declarative_base, sessionmaker
 
app = FastAPI(title="AstroTwin CDSS Hub")
 
# --- DATABASE SETUP (Feature F) ---
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://astronaut:deepspacepassword@db:5432/medical_inventory")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
 
class MedicalInventory(Base):
    __tablename__ = "inventory"
    id = Column(Integer, primary_key=True, index=True)
    medication = Column(String, unique=True, index=True)
    quantity = Column(Integer)
    location = Column(String)
    potency_reduction_pct = Column(Float)  # Accounts for radiation degradation
 
SEED_ITEMS = [
    dict(medication="B-Vitamin Complex", quantity=42, location="Medical Locker A, Drawer 1", potency_reduction_pct=5.0),
    dict(medication="Alendronate 10mg", quantity=14, location="Medical Locker B, Drawer 2", potency_reduction_pct=10.0),
    dict(medication="Supplemental O2 Tanks", quantity=8, location="Life Support Bay 3", potency_reduction_pct=0.0),
    dict(medication="LBNP Thigh Cuff Kit", quantity=2, location="Medical Locker C, Drawer 3", potency_reduction_pct=0.0),
]
 
def init_database():
    # Postgres can take a few seconds to accept connections after the container starts.
    for attempt in range(30):
        try:
            Base.metadata.create_all(bind=engine)
            break
        except OperationalError:
            print(f"[db] waiting for Postgres... ({attempt + 1}/30)")
            time.sleep(2)
    # Add any seed item that is missing (also upgrades an existing DB with new items).
    db = SessionLocal()
    existing = {name for (name,) in db.query(MedicalInventory.medication).all()}
    for item in SEED_ITEMS:
        if item["medication"] not in existing:
            db.add(MedicalInventory(**item))
    db.commit()
    db.close()
 
init_database()
# ----------------------------------
 
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
 
OLLAMA_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")
chroma_client = chromadb.PersistentClient(path="./chroma_data")
nasa_collection = chroma_client.get_or_create_collection(name="nasa_medical_protocols")
 
nasa_collection.upsert(
    documents=[
        "SANS & Optic Disc Edema Protocol: Do not evacuate. Apply -20 mmHg Lower Body Negative Pressure (LBNP) using thigh cuffs to reverse cephalad fluid shifts. Administer targeted B-Vitamin complex. Reduce cabin PCO2 levels."
    ],
    ids=["protocol_sans"]
)
 
class TempusTelemetry(BaseModel):
    heart_rate: int
    spo2: int
    bp_sys: int
    bp_dia: int
    ultrasound_status: str
    device: str
 
latest_state = {
    "vitals": {"heart_rate": "--", "spo2": "--", "bp_sys": "--", "bp_dia": "--"},
    "tier": "Standby",
    "status": "Waiting for telemetry...",
    "triage_protocol": "System standing by...",
    "is_critical": False,
    "protocol": None,  # structured protocol; kept after the vitals go back to normal
}
 
# ---------------------------------------------------------------------------
# Inventory lookup (real DB values, never invented by the LLM)
# ---------------------------------------------------------------------------
def get_item(name_fragment: str):
    db = SessionLocal()
    row = db.query(MedicalInventory).filter(MedicalInventory.medication.ilike(f"%{name_fragment}%")).first()
    item = None
    if row:
        item = {
            "name": row.medication,
            "qty": row.quantity,
            "location": row.location,
            "potency_loss_pct": row.potency_reduction_pct or 0.0,
        }
    db.close()
    return item
 
# ---------------------------------------------------------------------------
# Deterministic protocol builder: rules decide, the LLM only explains.
# ---------------------------------------------------------------------------
_protocol_ids = itertools.count(1)
 
def _step(title, action, item=None, caution=None):
    return {"title": title, "action": action, "item": item, "caution": caution}
 
def build_protocol(v: TempusTelemetry):
    flags = []
    findings = []
    hypoxia = v.spo2 < 95
    tachy = v.heart_rate > 100
    htn = v.bp_sys >= 140 or v.bp_dia >= 90
    edema = "Edema" in v.ultrasound_status
 
    if hypoxia:
        flags.append("hypoxia")
        findings.append({"label": "SpO2", "value": f"{v.spo2}%", "state": "low"})
    if tachy:
        flags.append("tachycardia")
        findings.append({"label": "Heart rate", "value": f"{v.heart_rate} BPM", "state": "high"})
    if htn:
        flags.append("hypertension")
        findings.append({"label": "Blood pressure", "value": f"{v.bp_sys}/{v.bp_dia}", "state": "high"})
    if edema:
        flags.append("edema")
        findings.append({"label": "Optic ultrasound", "value": "Disc edema", "state": "alert"})
 
    severity = "CRITICAL" if (v.spo2 < 90 or v.heart_rate >= 120) else "WARNING"
 
    names = []
    if hypoxia: names.append("low oxygen")
    if tachy: names.append("fast heart rate")
    if htn: names.append("high blood pressure")
    if edema: names.append("optic disc swelling")
    headline = (" + ".join(names)).capitalize() if names else "Abnormal reading"
 
    steps = []
    if hypoxia:
        if v.spo2 < 90:
            action = "Start supplemental oxygen now, then re-measure SpO2 on the left index finger."
        else:
            action = "Re-seat the pulse oximeter on the left index finger and re-measure. If SpO2 stays below 92%, start supplemental oxygen."
        steps.append(_step("Restore oxygen", action, get_item("O2"),
                           "Get a crew member to help if breathing becomes labored."))
    if edema:
        steps.append(_step("Reverse the fluid shift (LBNP)",
                           "Apply -20 mmHg Lower Body Negative Pressure using the thigh cuffs.",
                           get_item("LBNP"),
                           "Stop if you feel lightheaded, faint or nauseous."))
        steps.append(_step("Give B-vitamin complex",
                           "Administer the targeted B-vitamin complex (NASA SANS protocol).",
                           get_item("B-Vitamin")))
        steps.append(_step("Lower cabin CO2",
                           "Check the CO2 scrubber and increase cabin ventilation, then re-check the cabin CO2 reading."))
    if tachy or htn:
        steps.append(_step("Rest and re-measure",
                           "Stop strenuous activity and rest for 10 minutes, then re-measure heart rate and blood pressure."))
    for i, s in enumerate(steps, start=1):
        s["n"] = i
 
    monitoring = ["Re-measure HR, SpO2 and BP every 10 minutes until they are back to normal."]
    if edema:
        monitoring.append("Repeat the optic ultrasound after treatment to check for improvement.")
 
    # Source: show the retrieved NASA guideline when it actually applies
    source = "Onboard vitals thresholds (HR > 100, SpO2 < 95, BP >= 140/90)"
    if edema:
        try:
            doc = nasa_collection.query(query_texts=[v.ultrasound_status], n_results=1)["documents"][0][0]
            source = doc.split(":")[0] + " (local NASA HRP library)"
        except Exception:
            source = "SANS & Optic Disc Edema Protocol (local NASA HRP library)"
 
    return {
        "id": next(_protocol_ids),
        "created_at": time.time(),
        "severity": severity,
        "headline": headline,
        "findings": findings,
        "steps": steps,
        "monitoring": monitoring,
        "escalation": "Report to Mission Control when a link is available, but do not wait for a reply before acting. "
                      "Treat confusion, fainting, or SpO2 below 90% despite oxygen as an emergency.",
        "source": source,
        "flags": flags,
        "rationale": "",
        "rationale_status": "pending",   # pending | ready | fallback
    }
 
def fallback_rationale(flags):
    parts = []
    if "edema" in flags:
        parts.append("Optic disc swelling in microgravity can be a sign of fluid shifting toward the head (SANS).")
    if "hypoxia" in flags:
        parts.append("Low blood oxygen means the body is not getting enough oxygen and needs prompt attention.")
    if "tachycardia" in flags or "hypertension" in flags:
        parts.append("A fast heart rate or raised blood pressure adds extra strain on the body.")
    parts.append("The steps below address these findings in priority order.")
    return " ".join(parts[:3])
 
def protocol_as_text(p):
    lines = [f"{p['severity']}: {p['headline']}"]
    for s in p["steps"]:
        lines.append(f"{s['n']}. {s['title']} - {s['action']}")
        if s["item"]:
            it = s["item"]
            lines.append(f"   {it['name']} | {it['qty']} remaining | {it['location']} | potency -{it['potency_loss_pct']}%")
    return "\n".join(lines)
 
# ---------------------------------------------------------------------------
# LLM: plain-language explanation only (runs in the background, never blocks)
# ---------------------------------------------------------------------------
llm_lock = threading.Lock()
rationale_cache = {}   # signature of flags -> explanation text
 
def _set_rationale(pid, text, status):
    p = latest_state.get("protocol")
    if p and p["id"] == pid:
        p["rationale"] = text
        p["rationale_status"] = status
        latest_state["triage_protocol"] = protocol_as_text(p)
 
def run_llm_rationale(pid, signature, findings_text, step_titles, flags):
    if not llm_lock.acquire(blocking=False):
        _set_rationale(pid, fallback_rationale(flags), "fallback")
        return
    try:
        prompt = (
            "You are AstroTwin, an onboard medical assistant helping an astronaut who is not a doctor. "
            "Earth contact is unavailable.\n"
            f"Findings: {findings_text}\n"
            f"Planned steps: {', '.join(step_titles)}\n\n"
            "In 2 to 3 short, plain sentences (under 60 words), explain WHY these findings matter and what the "
            "steps are meant to achieve. Do NOT invent medications, doses, quantities or locations, and do NOT add "
            "new steps. No bullet points, no markdown."
        )
        r = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False,
                  "options": {"temperature": 0.2, "num_predict": 120}},
            timeout=90,
        )
        data = r.json()
        if "error" in data:
            print(f"[llm] Ollama error: {data['error']}")
        text = "" if "error" in data else (data.get("response") or "")
        text = re.sub(r"[*#`_]", "", text).strip()
        refused = text.lower().startswith(("i cannot", "i can't", "i can not", "i'm sorry", "sorry"))
        print(f"[llm] {OLLAMA_MODEL} ({signature or 'none'}) refused={refused} -> {text!r}")
        if text and not refused:
            rationale_cache[signature] = text
            _set_rationale(pid, text, "ready")
        else:
            _set_rationale(pid, fallback_rationale(flags), "fallback")
    except Exception as e:
        print(f"[llm] explanation failed: {e}")
        _set_rationale(pid, fallback_rationale(flags), "fallback")
    finally:
        llm_lock.release()
 
# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------
@app.post("/api/tempus/vitals")
def ingest_tempus_data(vitals: TempusTelemetry, background_tasks: BackgroundTasks):
    is_critical = (
        vitals.heart_rate > 100
        or vitals.spo2 < 95
        or vitals.bp_sys >= 140
        or vitals.bp_dia >= 90
        or "Edema" in vitals.ultrasound_status
    )
    latest_state["vitals"] = vitals.model_dump()
    latest_state["is_critical"] = is_critical
 
    if is_critical:
        protocol = build_protocol(vitals)
        signature = "|".join(sorted(protocol["flags"]))
 
        cached = rationale_cache.get(signature)
        if cached:
            protocol["rationale"], protocol["rationale_status"] = cached, "ready"
        else:
            protocol["rationale"] = fallback_rationale(protocol["flags"])
            findings_text = "; ".join(f"{f['label']} {f['value']}" for f in protocol["findings"])
            background_tasks.add_task(
                run_llm_rationale, protocol["id"], signature, findings_text,
                [s["title"] for s in protocol["steps"]], protocol["flags"],
            )
 
        latest_state["protocol"] = protocol
        latest_state["tier"] = "Tier 2 - Critical Triage"
        latest_state["status"] = "Anomaly Detected"
        latest_state["triage_protocol"] = protocol_as_text(protocol)
    else:
        # Keep the last protocol so it stays visible (dimmed) after vitals recover.
        latest_state["tier"] = "Tier 1 - Routine"
        latest_state["status"] = "Nominal"
        latest_state["triage_protocol"] = "None required. Continue standard mission operations."
 
    return get_current_state()
 
@app.post("/api/debug/reset")
def reset_debug_state():
    """Testing helper: forget cached LLM explanations and the current protocol."""
    rationale_cache.clear()
    latest_state["protocol"] = None
    return {"ok": True, "cache_cleared": True}
 
@app.get("/api/state")
def get_current_state():
    state = dict(latest_state)
    p = state.get("protocol")
    if p:
        p = dict(p)
        p["age_s"] = int(time.time() - p["created_at"])
        state["protocol"] = p
    return state
 