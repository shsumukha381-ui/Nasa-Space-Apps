# AstroTwin 🚀
**By Team DevOperations**

> An Autonomous Clinical Decision Support System (CDSS) for Earth-Independent Medical Operations (EIMO).

---

## 🌌 The Core Problem
On deep-space missions to the Moon and Mars, progressive communication delays and signal outages render real-time Earth telemedicine impossible. Astronauts—who are not doctors—must rely on themselves to monitor their health, diagnose anomalies, and administer treatments in a hostile, resource-constrained environment.

## 💡 Our Solution
AstroTwin is a **fully offline, deterministic health triage dashboard**. It ingests vital data from onboard sensors (like the Tempus Pro and smartwatches), evaluates physiological risks using a **Multi-Stressor Synergy Engine**, and provides step-by-step, Earth-independent medical guidance through an interactive **3D Anatomical Bio-Twin**.

---

## ⚙️ Key Functional Modules

### A. 3D Anatomical Bio-Twin (UI/UX)
* **Visual Triage:** An interactive 3D human figure segmented into body systems using dynamic color-coding (Nominal Green, Caution Amber, Critical Red) so astronauts can assess their health status at a glance.
* **Step-by-Step Guidance:** Clicking a body part opens beginner-friendly instructions explaining the organ's function, why an exam is needed, and how to perform self-assessments (e.g., AI-guided ultrasound probe placement).

### B. Tempus Pro Hardware Simulation
* Simulates the Tempus Pro telemedicine device, collecting vital health data and medical imaging.
* Processes data entirely locally without Earth contact, utilizing a local API mocker generating JSON payloads for HR, BP, and mock ultrasound images.

### C. Local RAG & Medical Triage Engine (AI & Logic)
* **Offline-First LLM:** Uses Ollama running locally (MedGemma 1.5 / Llama 3) paired with a ChromaDB vector database to store NASA Human Research Program (HRP) guidelines and Medical Technical Briefs.
* **Graded Autonomy:** Scales across tiers. For Tier 1 (Routine), it logs tasks. For Tier 2 (Time-Critical Events), the onboard edge-AI provides rapid autonomous triage and procedural guidance.

### D. Multi-Stressor Synergy & Risk Engine
* Detects non-additive interactions when multiple spaceflight hazards (e.g., microgravity fluid shifts, space radiation, elevated cabin CO2) occur simultaneously.
* **Gamified Countermeasures:** Converts daily health tasks into a cooperative "Mission Readiness Score".
  * *Bone Loss:* Prescribes ARED resistive loading, alendronate, and Vitamin D.
  * *Psychological/Sleep:* Triggers the ARCHeR study Dynamic Lighting Schedule to combat circadian misalignment.

### E. The "Judge’s Sandbox" (Deep-Space Anomaly Simulator)
* **Interactive Evaluation:** A dedicated control board built specifically for hackathon judges to test the software's limits.
* **Live Synergy Demonstration:** Drag sliders for Cabin CO2, Solar Radiation, Days in Space, and Sleep. Watch the 3D Bio-Twin change from green to red, instantly triggering the LangGraph backend to generate a new deterministic triage protocol.

### F. Spacecraft Medical Kit & Pharmacokinetic Stewardship
* **Inventory Database:** A PostgreSQL table tracks the spacecraft's medical inventory. The LangGraph RAG system cross-references this database to ensure a recommended drug is available and safe.
* **Context-Aware UI:** Displays specific logistical data: *"Recommended: 10mg Alendronate. Inventory Check: 14 pills remaining. Location: Locker B. Warning: Potency reduced by 10% due to flight duration."*

### G. Hub-and-Spoke Edge AI Architecture (Wearable Integration)
* **The GPU Constraint:** Simulates the reality that smartwatches lack GPUs/RAM to run heavy LLMs locally.
* **The Architecture:** The wearable (Spoke) acts as a lightweight data collection node running heavily compressed TinyML models. Once an anomaly is flagged, it transmits data to the spacecraft's central server (Hub) where the heavy LangGraph state machine generates the protocol.
* Simulated via a standalone `smartwatch_edge_node.py` script bridging the GPU-less wearable and the heavy LLM backend.

---

## 🛰️ Official NASA Data Integration
To prove the system works on real spaceflight biology, the backend programmatically connects to official NASA APIs:
* **NASA OSDR (Open Science Data Repository):** Ingests baseline reference data from studies like OSD-288 (Combined Space Radiation, Microgravity) and OSD-817 (SANS Neuro-Ocular Syndrome).
* **NASA DONKI API:** Queries real-time Space Weather. If a Coronal Mass Ejection (CME) is detected, AstroTwin automatically triggers a radiation storm shelter protocol.

---

## 🛠️ Technical Architecture (The Stack)
Designed to run completely locally on a Linux environment, simulating an isolated spacecraft server cluster.

* **Frontend:** React.js, TypeScript, Tailwind CSS, Three.js / React Three Fiber (3D engine), AG Grid.
* **Backend:** Python, FastAPI.
* **State Machine:** LangGraph (Deterministic medical workflows).
* **AI / Local Search:** Ollama (MedGemma 1.5) and ChromaDB.
* **Edge Nodes:** Python (Mocking low-power IoT constraints).
* **Database & Infra:** PostgreSQL, Docker Compose.

---

## 🚀 How to Run Locally

1. **Clone the repository:**
   ```bash
   git clone https://github.com/tejassa272-png/Nasa-Space-Apps.git
   cd Nasa-Space-Apps
   ```
2. **Start the localized Docker cluster:**
   ```bash
   docker-compose up -d --build
   ```
3. **Ensure Ollama is running locally** with your chosen model (`llama3.2` or `medgemma`).
4. **Access the Dashboard:** Open `http://localhost:5173` in your browser.
5. **Test the Logic:** Open the "Judge's Sandbox" in the UI to drag sliders and trigger deep-space anomalies.