import { useState } from 'react';
import { Activity, Bone, Check, ChevronRight, Eye, Radio, Satellite, ShieldAlert, Watch, Wind } from 'lucide-react';
import { api, getErrorMessage, type ApiSession, type TempusTelemetry } from './api';
import './DemoMenu.css';

const NOMINAL: TempusTelemetry = {
  heart_rate: 73,
  spo2: 98,
  bp_sys: 118,
  bp_dia: 76,
  ultrasound_status: 'Clear',
  bone_status: 'Normal',
  device: 'Tempus Pro · simulation',
};

const SCENARIOS = [
  { id: 'nominal', title: 'Nominal recovery', detail: 'Send stable readings', icon: Check, tone: 'green', vitals: NOMINAL },
  { id: 'hypoxia', title: 'Hypoxia', detail: 'Low oxygen saturation', icon: Wind, tone: 'amber', vitals: { ...NOMINAL, spo2: 89 } },
  { id: 'edema', title: 'Optic disc edema', detail: 'Abnormal ultrasound finding', icon: Eye, tone: 'amber', vitals: { ...NOMINAL, ultrasound_status: 'Optic Disc Edema Detected' } },
  { id: 'bone', title: 'Bone density loss', detail: 'Abnormal bone scan', icon: Bone, tone: 'amber', vitals: { ...NOMINAL, bone_status: 'Bone Density Loss Detected' } },
  { id: 'anomaly', title: 'Multi-system anomaly', detail: 'Combined vital signs and ultrasound alert', icon: ShieldAlert, tone: 'red', vitals: { ...NOMINAL, heart_rate: 123, spo2: 89, bp_sys: 151, bp_dia: 96, ultrasound_status: 'Optic Disc Edema Detected' } },
  { id: 'wearable', title: 'Wearable alert', detail: 'Simulated Astro-Watch telemetry', icon: Watch, tone: 'purple', vitals: { ...NOMINAL, heart_rate: 113, spo2: 92, bp_sys: 130, bp_dia: 85, ultrasound_status: 'Not measured', bone_status: 'Not measured', device: 'Astro-Watch · simulation' } },
] as const;

interface Props {
  disabled: boolean;
  allowScenarios: boolean;
  session: ApiSession | null;
  onBusyChange: (busy: boolean) => void;
  onUpdated: () => void;
  onUnauthorized: (error: unknown, attemptedSession: ApiSession | null) => void;
}

const waitForPoll = () => new Promise<void>((resolve) => setTimeout(resolve, 1350));

export default function DemoMenu({ disabled, allowScenarios, session, onBusyChange, onUpdated, onUnauthorized }: Props) {
  const [running, setRunning] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  async function execute(id: string, action: () => Promise<string>) {
    if (running || disabled) return;
    setRunning(id);
    setFeedback(null);
    onBusyChange(true);
    try {
      setFeedback({ tone: 'success', text: await action() });
    } catch (error) {
      onUnauthorized(error, session);
      setFeedback({ tone: 'error', text: getErrorMessage(error) });
    } finally {
      onUpdated();
      onBusyChange(false);
      setRunning(null);
    }
  }

  async function runScenario({ id, title, vitals }: (typeof SCENARIOS)[number]) {
    if (!allowScenarios) return;
    const baseline: TempusTelemetry = id === 'wearable'
      ? { ...NOMINAL, ultrasound_status: 'Not measured', bone_status: 'Not measured' }
      : NOMINAL;
    await execute(id, async () => {
      for (const heart_rate of [68, 76, 71]) {
        await api.sendVitals({ ...baseline, heart_rate, device: vitals.device });
        onUpdated();
        await waitForPoll();
      }
      await api.sendVitals(vitals);
      return `${title} complete. See the latest readings in Overview.`;
    });
  }

  async function checkNasa() {
    await execute('nasa', () => api.syncNasa(session));
  }

  return (
    <section className="panel demo-panel" aria-labelledby="demo-title">
      <div className="card-heading">
        <div className="card-heading-main">
          <span className="card-icon"><Radio size={19} aria-hidden="true" /></span>
          <div>
            <h2 id="demo-title">{allowScenarios ? 'Telemetry scenarios' : 'Mission references'}</h2>
            {allowScenarios && <p>Test readings replace the current backend telemetry.</p>}
          </div>
        </div>
      </div>
      <div className="demo-content">
        {allowScenarios && <div className="scenario-grid">
          {SCENARIOS.map((scenario) => (
            <button className="scenario-button" type="button" key={scenario.id} onClick={() => void runScenario(scenario)} disabled={disabled || running !== null}>
              <span className={`scenario-icon scenario-${scenario.tone}`}><scenario.icon size={16} aria-hidden="true" /></span>
              <span><strong>{scenario.title}</strong><small>{running === scenario.id ? 'Sending readings…' : scenario.detail}</small></span>
              <ChevronRight className="scenario-chevron" size={14} aria-hidden="true" />
            </button>
          ))}
        </div>}
        <div className="nasa-check">
          <span className="scenario-icon scenario-blue"><Satellite size={17} aria-hidden="true" /></span>
          <div><strong>NASA records</strong><small>Check historical OSDR and DONKI references.</small></div>
          <button type="button" className="button button-secondary" disabled={disabled || running !== null} onClick={() => void checkNasa()}>
            {running === 'nasa' ? 'Checking…' : 'Check records'}
          </button>
        </div>
        {disabled && !running && <p className="demo-muted">These actions are available when the API is connected and idle.</p>}
        {(running || feedback) && (
          <p className={`demo-feedback ${feedback ? `result-${feedback.tone}` : ''}`} role={feedback?.tone === 'error' ? 'alert' : 'status'}>
            {!feedback && <Activity size={15} aria-hidden="true" />}
            {feedback?.text ?? (running === 'nasa' ? 'Waiting for NASA records…' : 'Waiting for the backend to process the sequence…')}
          </p>
        )}
      </div>
    </section>
  );
}
