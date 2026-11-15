import { useId, useState } from 'react';
import { AlertTriangle, MapPin, Package, RefreshCw } from 'lucide-react';
import type { InventoryStatus, TriageItem } from './api';
import './InventoryPanel.css';

export type PanelConnection = 'loading' | 'online' | 'offline';

const statusLabels: Record<InventoryStatus, string> = {
  ok: 'In stock',
  low: 'Low stock',
  degraded: 'Reduced potency',
  unusable: 'Unusable',
  out: 'Out of stock',
};

export function InventoryStatusBadge({ status }: { status: InventoryStatus }) {
  return <span className={`inv-status inv-status--${status}`}>{statusLabels[status]}</span>;
}

interface Props {
  items: TriageItem[];
  inUse: ReadonlySet<string>;
  connection?: PanelConnection;
}

export default function InventoryPanel({ items, inUse, connection = 'online' }: Props) {
  const headingId = useId();
  const [attentionOnly, setAttentionOnly] = useState(false);
  const requiresAttention = items.filter((item) => item.status !== 'ok');
  const visible = attentionOnly ? requiresAttention : items;
  const hasInventory = items.length > 0;

  return (
    <section className="panel inv-panel" aria-labelledby={headingId}>
      <header className="inv-heading">
        <span className="inv-heading-icon"><Package size={17} aria-hidden="true" /></span>
        <h2 id={headingId}>Medical inventory</h2>
        {hasInventory && <span className="inv-count">{items.length} {items.length === 1 ? 'supply' : 'supplies'}</span>}
      </header>

      {connection === 'offline' && hasInventory && (
        <p className="inv-notice" role="status">
          <AlertTriangle size={14} aria-hidden="true" /> Showing last received inventory.
        </p>
      )}

      {hasInventory ? (
        <>
          <div className="inv-filters" role="group" aria-label="Inventory filters">
            <button type="button" aria-pressed={!attentionOnly} onClick={() => setAttentionOnly(false)}>
              All supplies
            </button>
            <button type="button" aria-pressed={attentionOnly} onClick={() => setAttentionOnly(true)}>
              Needs attention <span className="inv-filter-count">{requiresAttention.length}</span>
            </button>
          </div>

          {visible.length > 0 ? (
            <ul className="inv-list" aria-label="Medical supplies" tabIndex={0}>
              {visible.map((item) => {
                const inProtocol = inUse.has(item.name);
                const potency = Math.max(0, Math.min(100, 100 - item.potency_loss_pct));
                return (
                  <li key={item.name} className="inv-row">
                    <div className="inv-row-main">
                      <div className="inv-name">{item.name}</div>
                      <div className="inv-location"><MapPin size={12} aria-hidden="true" /> {item.location}</div>
                      {(inProtocol || item.status !== 'ok' || item.potency_loss_pct > 0) && (
                        <div className="inv-item-details">
                          {inProtocol && <span className="inv-in-protocol">In protocol</span>}
                          {item.status !== 'ok' && <InventoryStatusBadge status={item.status} />}
                          {item.potency_loss_pct > 0 && <span>{potency.toFixed(0)}% potency</span>}
                        </div>
                      )}
                    </div>
                    <div className="inv-qty">
                      <strong>{item.qty}</strong>
                      <span>{item.qty === 1 ? item.unit.replace(/s$/, '') : item.unit}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : <p className="inv-empty" role="status">No inventory issues in the {connection === 'offline' ? 'last received ' : ''}records.</p>}
        </>
      ) : (
        <div className="inv-empty" role="status">
          {connection === 'loading' && <RefreshCw size={16} aria-hidden="true" />}
          {connection === 'offline' && <AlertTriangle size={16} aria-hidden="true" />}
          {connection === 'online' && <Package size={16} aria-hidden="true" />}
          {connection === 'loading' && 'Loading inventory…'}
          {connection === 'offline' && 'Inventory is unavailable while the API is offline.'}
          {connection === 'online' && 'No inventory records were returned.'}
        </div>
      )}
    </section>
  );
}
