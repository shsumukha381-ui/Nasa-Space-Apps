import { Activity, AlertTriangle, Bot, ClipboardList, ListChecks, MapPin, Package, RefreshCw, ShieldCheck } from 'lucide-react';
import type { Protocol, TriageItem } from './api';
import { InventoryStatusBadge, type PanelConnection } from './InventoryPanel';
import './TriagePanel.css';

export type { Finding, Protocol, TriageItem, TriageStep } from './api';

const rationaleLabels: Record<Protocol['rationale_status'], string> = {
  pending: 'Generating',
  ready: 'Available',
  fallback: 'Standard guidance',
};

function formatAge(seconds: number) {
  if (seconds < 60) return `${Math.max(0, seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

function ItemStrip({ item, label }: { item: TriageItem; label: string }) {
  const potency = Math.max(0, Math.min(100, 100 - item.potency_loss_pct));
  return (
    <div className="tp-item">
      <div className="tp-item-top">
        <span className="tp-item-caption">{label}</span>
        <InventoryStatusBadge status={item.status} />
      </div>
      <div className="tp-item-name"><Package size={14} aria-hidden="true" /> <strong>{item.name}</strong></div>
      <div className="tp-item-meta">
        <span><MapPin size={13} aria-hidden="true" /> {item.location}</span>
        <span>{item.qty} {item.qty === 1 ? item.unit.replace(/s$/, '') : item.unit} remaining</span>
      </div>
      {item.potency_loss_pct > 0 && <div className="tp-item-potency">{potency.toFixed(0)}% recorded potency</div>}
      {item.warning && <div className="tp-caution"><AlertTriangle size={14} aria-hidden="true" /> {item.warning}</div>}
    </div>
  );
}

interface Props {
  protocol: Protocol | null;
  active: boolean;
  inventory?: TriageItem[];
  connection?: PanelConnection;
}

export default function TriagePanel({ protocol, active, inventory = [], connection = 'online' }: Props) {
  if (!protocol) {
    if (connection === 'loading') {
      return (
        <div className="tp-empty" role="status">
          <span className="tp-empty-icon"><RefreshCw size={20} aria-hidden="true" /></span>
          <strong>Checking for a triage protocol…</strong>
        </div>
      );
    }

    if (connection === 'offline') {
      return (
        <div className="tp-empty" role="status">
          <span className="tp-empty-icon"><AlertTriangle size={20} aria-hidden="true" /></span>
          <strong>Triage is unavailable</strong>
          <p>The API connection is offline.</p>
        </div>
      );
    }

    return (
      <div className="tp-empty" role="status">
        <span className="tp-empty-icon"><Activity size={20} aria-hidden="true" /></span>
        <strong>{active ? 'Awaiting a triage protocol' : 'No active triage protocol'}</strong>
        <p>{active
          ? 'The API reported an alert. Response steps will appear when it returns a protocol.'
          : 'Response steps appear here when a telemetry or environmental alert triggers a protocol.'}</p>
      </div>
    );
  }

  const online = connection === 'online';
  const current = online && active;
  const severity = protocol.severity === 'CRITICAL' ? 'Critical' : 'Warning';
  const bannerClass = current ? protocol.severity.toLowerCase() : 'past';
  const age = online && protocol.age_s !== undefined ? `Created ${formatAge(protocol.age_s)} ago` : '';

  return (
    <article className="tp-scroll">
      <div className={`tp-banner tp-banner--${bannerClass}`}>
        <div className="tp-banner-top">
          <span className="tp-sev" role="status">
            <AlertTriangle size={14} aria-hidden="true" />
            {current ? `Active ${severity.toLowerCase()} alert` : `${online ? 'Previous' : 'Last received'} ${severity.toLowerCase()} alert`}
          </span>
          {age && <span className="tp-age">{age}</span>}
        </div>
        <h3 className="tp-headline">{protocol.headline}</h3>
        {protocol.findings.length > 0 && (
          <ul className="tp-chips" role="list" aria-label="Triage findings">
            {protocol.findings.map((finding) => (
              <li key={`${finding.label}-${finding.value}`} className="tp-chip">
                {finding.label} <strong>{finding.value}</strong>
                {finding.state === 'low' && <span className="tp-reading-state">Low</span>}
                {finding.state === 'high' && <span className="tp-reading-state">High</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!online && (
        <p className="tp-stale" role="status">Live updates are unavailable while disconnected.</p>
      )}

      <section className="tp-block">
        <h4 className="tp-section"><ClipboardList aria-hidden="true" size={15} /> Response sequence</h4>
        {protocol.steps.length > 0 ? (
          <ol className="tp-steps" role="list">
            {protocol.steps.map((step, index) => {
              const number = step.n ?? index + 1;
              const liveItem = current && step.item
                ? inventory.find((item) => item.name === step.item?.name)
                : undefined;
              const item = liveItem ?? step.item;
              const snapshotWarning = step.item?.warning;
              const caution = snapshotWarning && step.caution?.endsWith(snapshotWarning)
                ? step.caution.slice(0, -snapshotWarning.length).trim()
                : step.caution;
              return (
                <li key={`${protocol.id}-${number}`} className="tp-step" value={number}>
                  <span className="tp-step-num" aria-hidden="true">{number}</span>
                  <div className="tp-step-body">
                    <h5 className="tp-step-title">{step.title}</h5>
                    <p className="tp-step-action">{step.action}</p>
                    {caution && <p className="tp-caution"><AlertTriangle size={14} aria-hidden="true" /> {caution}</p>}
                    {item && <ItemStrip item={item} label={liveItem ? 'Current inventory' : 'Inventory at time of alert'} />}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : <p className="tp-empty-section">The API returned no response steps for this alert.</p>}
      </section>

      {protocol.monitoring.length > 0 && (
        <section className="tp-block">
          <h4 className="tp-section"><ListChecks size={15} aria-hidden="true" /> Monitoring</h4>
          <ul className="tp-monitor">
            {protocol.monitoring.map((task) => <li key={task}>{task}</li>)}
          </ul>
        </section>
      )}

      {protocol.escalation && (
        <section className="tp-escalation">
          <h4 className="tp-section"><AlertTriangle size={15} aria-hidden="true" /> Escalation</h4>
          <p>{protocol.escalation}</p>
        </section>
      )}

      {(protocol.rationale || protocol.rationale_status === 'pending') && (
        <section className="tp-rationale">
          <div className="tp-rationale-head">
            <h4 className="tp-section"><Bot size={15} aria-hidden="true" /> Rationale</h4>
            <span className="tp-rationale-status">{rationaleLabels[protocol.rationale_status]}</span>
          </div>
          {protocol.rationale && <p>{protocol.rationale}</p>}
        </section>
      )}

      <footer className="tp-footer">
        <ShieldCheck size={15} aria-hidden="true" />
        <div>
          <p>Decision support only. Confirm with the Crew Medical Officer.</p>
          {protocol.source && <p>Source · {protocol.source}</p>}
        </div>
      </footer>
    </article>
  );
}
