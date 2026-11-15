import { Activity, Watch, ShieldAlert, CheckCircle2, Bone, Eye, Wind } from 'lucide-react';
import './DemoMenu.css';

const API = 'http://localhost:8000/api/tempus/vitals';

interface Payload {
  heart_rate: number;
  spo2: number;
  bp_sys: number;
  bp_dia: number;
  ultrasound_status: string;
  bone_status: string;
  device: string;
}

// 1. Helper to generate random variance, matching the Python script
const r = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

// 2. Dynamic base generator (jitter ensures the chart renders every point)
const base = (): Payload => ({
  heart_rate: r(60, 80), 
  spo2: r(97, 100), 
  bp_sys: r(110, 120), 
  bp_dia: r(70, 80),
  ultrasound_status: 'Clear', 
  bone_status: 'Normal', 
  device: 'Tempus Pro - Lunar Base'
});

// 3. Send 3 nominal readings, waiting 1.2s between each to guarantee the frontend polls it, THEN anomaly
const runSequence = async (anomalyFn: () => Payload) => {
  for (let i = 0; i < 3; i++) {
    await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(base()),
    });
    await new Promise(resolve => setTimeout(resolve, 1200)); 
  }
  
  // Fire the actual anomaly
  await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(anomalyFn()),
  });
};

const SCENARIOS = [
  { label: 'Nominal Recovery', icon: CheckCircle2, color: 'var(--status-nominal)', action: () => runSequence(() => base()) },
  { label: 'Hypoxia (Lungs)', icon: Wind, color: 'var(--status-warning)', action: () => runSequence(() => ({ ...base(), spo2: r(86, 92) })) },
  { label: 'Edema (SANS)', icon: Eye, color: 'var(--status-warning)', action: () => runSequence(() => ({ ...base(), ultrasound_status: 'Optic Disc Edema Detected' })) },
  { label: 'Bone Resorption', icon: Bone, color: 'var(--status-warning)', action: () => runSequence(() => ({ ...base(), bone_status: 'Bone Density Loss Detected' })) },
  { label: 'Full System Anomaly', icon: ShieldAlert, color: 'var(--status-critical)', action: () => runSequence(() => ({ ...base(), heart_rate: r(110, 130), spo2: r(88, 93), bp_sys: r(140, 160), bp_dia: r(90, 100), ultrasound_status: 'Optic Disc Edema Detected' })) },
];

const EDGE_SCENARIO = {
  label: 'Trigger Edge Node Alert',
  icon: Watch,
  color: '#a855f7',
  action: () => runSequence(() => ({
    heart_rate: r(105, 120), spo2: r(88, 94), bp_sys: r(120, 135), bp_dia: r(80, 90),
    ultrasound_status: 'Clear', bone_status: 'Normal',
    device: 'Astro-Watch Series 1 (Edge Node)'
  }))
};

export default function DemoMenu() {
  return (
    <aside className="demo-menu">
      <div className="dm-header">
        <Activity size={16} /> DEMO CONTROL
      </div>
      
      <div className="dm-section">
        <div className="dm-subtitle">TEMPUS PRO (HUB)</div>
        {SCENARIOS.map((s) => (
          <button key={s.label} className="dm-btn" onClick={s.action}>
            <s.icon size={14} style={{ color: s.color }} />
            {s.label}
          </button>
        ))}
      </div>

      <div className="dm-divider" />

      <div className="dm-section">
        <div className="dm-subtitle">WEARABLE (SPOKE)</div>
        <p className="dm-desc">Simulates GPU-less TinyML bypassing the network until HR &gt; 100 & SpO₂ &lt; 95.</p>
        <button className="dm-btn edge" onClick={EDGE_SCENARIO.action}>
          <EDGE_SCENARIO.icon size={14} style={{ color: EDGE_SCENARIO.color }} />
          {EDGE_SCENARIO.label}
        </button>
      </div>
    </aside>
  );
}