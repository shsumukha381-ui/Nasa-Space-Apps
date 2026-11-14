# Project Name: AstroTwin (by Team DevOperations)

**Tagline:** An Autonomous Clinical Decision Support System (CDSS) for Earth-Independent Medical Operations (EIMO).

### 1. The Core Problem

On deep-space missions to the Moon and Mars, progressive communication delays and signal outages render real-time Earth telemedicine impossible. Astronauts—who are not doctors—must rely on themselves to monitor their health, diagnose anomalies, and administer treatments in a hostile, resource-constrained environment.

### 2. Our Solution

AstroTwin is a fully offline, deterministic health triage dashboard. It ingests vital data from onboard sensors (like the Tempus Pro and smartwatches), evaluates physiological risks using a Multi-Stressor Synergy Engine, and provides step-by-step, Earth-independent medical guidance through an interactive 3D Anatomical Bio-Twin.

### 3. Key Functional Modules

**A. The 3D Anatomical Bio-Twin (UI/UX)**

* **Visual Triage:** An interactive human figure segmented into body systems. It uses dynamic color-coding (Nominal Green, Caution Amber, Critical Red) so astronauts can assess their health status at a glance.

* **Step-by-Step Guidance:** Clicking a body part opens beginner-friendly instructions explaining the organ's function, why an exam is needed, and how to perform self-assessments (e.g., AI-guided ultrasound probe placement).

**B. Tempus Pro Hardware Simulation**

* Simulates the Tempus Pro telemedicine device, which collects vital health data and medical imaging.

* Because the tool must work without Earth contact, the data is processed entirely locally. We simulate this live data stream using a local API mocker (Mockoon/Wiremock) generating JSON payloads for heart rate, blood pressure, and mock ultrasound images.

**C. Local RAG & Medical Triage Engine (AI & Logic)**

* **Offline-First LLM:** Uses Ollama running locally (MedGemma 1.5 or Llama 3) paired with a ChromaDB vector database to store NASA Human Research Program (HRP) guidelines and Medical Technical Briefs.

* **Graded Autonomy:** The system scales across tiers. For Tier 1 (Routine), it logs tasks. For Tier 2 (Time-Critical Events), the onboard edge-AI provides rapid autonomous triage and procedural guidance for the Crew Medical Officer.

**D. Multi-Stressor Synergy & Risk Engine**

* Unlike standard medical tools that look at one metric, this engine detects non-additive interactions when multiple spaceflight hazards (e.g., microgravity fluid shifts, space radiation, and elevated cabin CO2) happen simultaneously.

* **Gamified Countermeasures:** Converts daily health tasks into a cooperative "Mission Readiness Score".

  * *Bone Loss:* Prescribes ARED resistive loading, weekly alendronate, and Vitamin D if urinary resorption markers rise.

  * *Psychological/Sleep (ARCHeR study):* Triggers a Dynamic Lighting Schedule (5,000 K at 300 lux during work periods) to combat circadian misalignment and cognitive fatigue.

**E. The "Judge’s Sandbox" (Deep-Space Anomaly Simulator)**

* **Interactive Evaluation:** A dedicated, hidden side-panel control board built specifically for hackathon judges to test the software's limits.

* **Dynamic Sliders:** Features interactive sliders for various spaceflight hazards: *Cabin CO2 Levels*, *Solar Radiation Flux*, *Days in Space*, and *Hours of Sleep*.

* **Live Synergy Demonstration:** When judges drag the "Cabin CO2" and "Radiation" sliders up, they can instantly watch the 3D Anatomical Bio-Twin change from green to red. This triggers the LangGraph backend to instantly generate a new triage protocol, proving the Multi-Stressor Synergy Engine works dynamically.

**F. Spacecraft Medical Kit & Pharmacokinetic Stewardship**

* **Resource Management:** Deep space missions have strict payload limits and medications degrade faster in space due to radiation.

* **Inventory Database:** A PostgreSQL table tracks the spacecraft's "Medical Inventory." Whenever the LangGraph RAG system recommends a treatment, it first cross-references this database to ensure the drug is available and safe.

* **Context-Aware UI:** Instead of a generic "Take Medicine" prompt, the UI displays highly specific logistical data: *"Recommended: 10mg Alendronate. Inventory Check: 14 pills remaining. Location: Medical Locker B, Drawer 2. Warning: Potency reduced by 10% due to flight duration."* This demonstrates profound operational awareness.

**G. Hub-and-Spoke Edge AI Architecture (Wearable Integration)**

* **The GPU Constraint:** Smartwatches and wearable biomonitors lack GPUs and RAM, making them incapable of running heavy LLMs or RAG systems locally on the wrist.
* **The Architecture:** AstroTwin utilizes a Hub-and-Spoke model. The wearable (Spoke) acts as a lightweight data collection node running heavily compressed (quantized) TinyML models to flag anomalies. Once triggered, it transmits the data via a local low-power network to the spacecraft's central server (Hub), where the heavy LangGraph state machine and LLMs generate the treatment protocol.
* **Hackathon Simulation:** We simulate this hardware limitation directly in our code:
  * A lightweight Python script called `smartwatch_edge_node.py` generates normal JSON vitals.
  * It contains a basic, hardcoded logic gate: *If Heart Rate > 100 AND SpO2 < 95, send an HTTP POST request to the FastAPI backend.*
  * During the pitch, we will explain to the judges that this script represents the quantized Edge AI running on a GPU-less wearable, remaining completely independent of the heavy LLM backend until a critical threshold is breached.

### 4. Technical Architecture (The Stack)

The system is designed to run completely locally on a Linux environment (like an ASUS TUF), simulating a spacecraft's isolated server cluster.

* **Frontend:** React.js, TypeScript, Tailwind CSS, and Three.js (or React Three Fiber) for the interactive 3D human body. AG Grid for dense telemetry charts.

* **Backend:** Python and FastAPI.

* **State Machine:** LangGraph for building deterministic medical workflows (e.g., `Ingest_Vitals` → `Check_Synergy` → `Retrieve_Protocol` → `Check_Inventory` → `Display_Countermeasure`).

* **AI/Local Search:** Ollama (MedGemma) and ChromaDB / FAISS.

* **Edge Nodes:** Standalone Python scripts (`smartwatch_edge_node.py`) mimicking low-power IoT constraints.

* **Database & Infra:** PostgreSQL for storing historical vitals and medical kit inventory, all containerized via Docker Compose.

### 5. Official NASA Data Integration (Crucial for "Relevance" Score)

To prove the system works on real spaceflight biology, the backend programmatically connects to official NASA APIs:

* **NASA OSDR (Open Science Data Repository):** Ingests baseline reference data from studies like OSD-288 (Combined Space Radiation, Microgravity) and OSD-817 (SANS Neuro-Ocular Syndrome).

* **NASA DONKI API:** Queries real-time Space Weather (Solar Energetic Particles and Coronal Mass Ejections). If a radiation event is detected, AstroTwin automatically triggers a radiation storm shelter protocol and elevates immune biomarker monitoring.
