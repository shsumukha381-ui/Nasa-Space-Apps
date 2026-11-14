import { useEffect, useState } from 'react';
import { Activity, Zap, HeartPulse, Settings, Database, Crosshair, TrendingUp } from 'lucide-react';
import HumanModel from './HumanModel';
import VitalsChart, { type VitalsSample } from './VitalsChart';
import TriagePanel, { type Protocol } from './TriagePanel';
import './index.css'; 

const HISTORY_LIMIT = 40;

function App() {
  const [data, setData] = useState({
    vitals: { heart_rate: '--', spo2: '--', bp_sys: '--', bp_dia: '--' },
    status: 'Waiting for telemetry...',
    tier: 'Standby',
    triage_protocol: 'System standing by...',
    is_critical: false,
    protocol: null as Protocol | null
  });
  
  const [selectedBodyPart, setSelectedBodyPart] = useState<string | null>(null);
  const [history, setHistory] = useState<VitalsSample[]>([]);
  
  const [radiationLevel, setRadiationLevel] = useState(10);
  const [co2Level, setCo2Level] = useState(400);

  useEffect(() => {
    const interval = setInterval(() => {
      fetch('http://localhost:8000/api/state')
        .then(res => res.json())
        .then(state => {
          setData(state);

          // Record a point only when a new Tempus reading arrives (the poll runs
          // every second, the device reports every few seconds).
          const v = state?.vitals;
          if (v && typeof v.heart_rate === 'number') {
            const sample: VitalsSample = { hr: v.heart_rate, spo2: v.spo2, sys: v.bp_sys, dia: v.bp_dia };
            setHistory(prev => {
              const last = prev[prev.length - 1];
              if (last && last.hr === sample.hr && last.spo2 === sample.spo2 && last.sys === sample.sys && last.dia === sample.dia) {
                return prev;
              }
              return [...prev, sample].slice(-HISTORY_LIMIT);
            });
          }
        })
        .catch(err => console.error("Backend offline", err));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const envCritical = radiationLevel > 70 || co2Level > 1200;
  const systemCritical = data.is_critical || envCritical;

  return (
    <>
      <header className="dashboard-header">
        <div>
          <h1 className="brand-title">AstroTwin</h1>
          <p className="brand-subtitle">EARTH-INDEPENDENT MEDICAL OPERATIONS (EIMO)</p>
        </div>
        <div className="header-status-bar">
          <div className="status-badge">
            <Database size={16} /> ENV: LUNAR BASE
          </div>
          <div className={`status-badge ${systemCritical ? 'critical' : 'nominal'}`}>
            <Activity size={16} /> {systemCritical ? 'CRITICAL ALERT' : 'NOMINAL'}
          </div>
        </div>
      </header>

      <div className="dashboard-grid">
        
        {/* Left Column: Vitals & Assessment */}
        <div className="col-left">
          <div className={`panel ${data.is_critical ? 'critical' : ''}`}>
            <div className="panel-header"><Zap size={16} color="#facc15" /> TEMPUS PRO STREAM</div>
            
            <div className="data-row">
              <span className="data-label"><HeartPulse size={14} style={{display:'inline', marginRight:'4px'}}/> Heart Rate</span>
              <div>
                <span className={`data-value ${data.is_critical ? 'critical' : 'nominal'}`}>{data.vitals.heart_rate}</span>
                <span className="data-unit">BPM</span>
              </div>
            </div>
            <div className="data-row">
              <span className="data-label">Blood O2 (SpO2)</span>
              <div>
                <span className={`data-value ${data.is_critical ? 'critical' : 'nominal'}`}>{data.vitals.spo2}</span>
                <span className="data-unit">%</span>
              </div>
            </div>
            <div className="data-row">
              <span className="data-label">Blood Pressure</span>
              <div>
                <span className={`data-value ${data.is_critical ? 'critical' : 'nominal'}`}>{data.vitals.bp_sys}/{data.vitals.bp_dia}</span>
              </div>
            </div>
          </div>
          
          {/* Vitals history charts */}
          <div className={`panel ${data.is_critical ? 'critical' : ''}`} style={{flex: 1, minHeight: 0}}>
            <div className="panel-header"><TrendingUp size={16} color="#38bdf8" /> VITALS TREND</div>
            <VitalsChart history={history} />
          </div>
        </div>

        {/* Center Column: Judge's Sandbox (grows as sliders are added) + Bio-Twin below */}
        <div className="col-left" style={{ minHeight: 0 }}>

          {/* Sandbox: 2-column slider grid. To add a slider, add another .sandbox-control div. */}
          <div className="panel" style={{ flex: '0 1 auto', minHeight: 0, overflowY: 'auto' }}>
            <div className="panel-header">
              <Settings size={16} color="#9ca3af" /> JUDGE'S SANDBOX
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem 1.5rem' }}>
              <div className={`sandbox-control ${radiationLevel > 70 ? 'danger' : ''}`} style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '0.75rem' }}><span>Solar Radiation</span> <span>{radiationLevel} mGy</span></label>
                <input type="range" min="0" max="100" value={radiationLevel} onChange={(e) => setRadiationLevel(parseInt(e.target.value))} />
              </div>
              <div className={`sandbox-control ${co2Level > 1200 ? 'danger' : ''}`} style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '0.75rem' }}><span>Cabin CO2</span> <span>{co2Level} ppm</span></label>
                <input type="range" min="400" max="2000" step="100" value={co2Level} onChange={(e) => setCo2Level(parseInt(e.target.value))} />
              </div>
            </div>
          </div>

          {/* Bio-Twin: takes all remaining height */}
          <div
            className={`panel ${systemCritical ? 'critical' : ''}`}
            style={{ flex: '1 1 0', minHeight: '320px', padding: 0, backgroundColor: '#090e17' }}
          >
            <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
              <HumanModel critical={systemCritical} onPartClick={setSelectedBodyPart} />

              {selectedBodyPart && (
                <div style={{ position: 'absolute', top: '0.75rem', left: '1rem', fontSize: '0.7rem', letterSpacing: '0.08em', color: 'var(--accent-blue)', textTransform: 'uppercase', pointerEvents: 'none' }}>
                  Selected: {selectedBodyPart}
                </div>
              )}

              <div style={{ position: 'absolute', bottom: '0.75rem', width: '100%', textAlign: 'center', fontWeight: 700, fontSize: '0.8rem', letterSpacing: '0.1em', pointerEvents: 'none' }}>
                <span style={{ color: systemCritical ? 'var(--status-critical)' : 'var(--status-nominal)' }}>
                  {systemCritical ? 'CRITICAL HAZARD DETECTED' : 'BIOMETRICS NOMINAL'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Medical Kit & Triage */}
        <div className="col-right">
          
          {/* Feature F: Pharmacokinetic Stewardship */}
          <div className="panel">
            <div className="panel-header"><Crosshair size={16} color="#38bdf8" /> MEDICAL INVENTORY (DB)</div>
            <div className="data-row" style={{ padding: '0.25rem 0' }}>
              <span className="data-label">B-Vitamin Complex</span>
              <span className="data-value" style={{ fontSize: '1.25rem' }}>42 <span className="data-unit">doses</span></span>
            </div>
            <div className="data-row" style={{ padding: '0.25rem 0', borderBottom: 'none' }}>
              <span className="data-label">Alendronate (10mg)</span>
              <span className="data-value" style={{ fontSize: '1.25rem' }}>14 <span className="data-unit">pills</span></span>
            </div>
          </div>

          <div className={`panel ${data.is_critical ? 'critical' : ''}`} style={{flex: 1, minHeight: 0}}>
            <div className="panel-header" style={{justifyContent: 'space-between'}}>
              <span>{data.tier.toUpperCase()}</span>
              <span style={{color: data.is_critical ? 'var(--status-critical)' : 'var(--status-nominal)'}}>RAG: ONLINE</span>
            </div>
            
            <TriagePanel protocol={data.protocol} active={data.is_critical} />
          </div>
        </div>

      </div>
    </>
  );
}

export default App;