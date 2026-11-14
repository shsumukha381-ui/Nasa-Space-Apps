import './VitalsChart.css';

export interface VitalsSample {
  hr: number;
  spo2: number;
  sys: number;
  dia: number;
}

interface TrackProps {
  label: string;
  unit: string;
  values: number[];
  min: number;
  max: number;
  limit: number;
  /** 'above' = critical when value > limit, 'below' = critical when value < limit */
  direction: 'above' | 'below';
}

const H = 40; // SVG viewBox height (width is 100, stretched to fit)
const OK = '#38bdf8';
const BAD = '#ef4444';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function Track({ label, unit, values, min, max, limit, direction }: TrackProps) {
  const key = label.replace(/\W/g, '');
  const n = values.length;
  const toY = (v: number) => H - ((clamp(v, min, max) - min) / (max - min)) * H;
  const toX = (i: number) => (n < 2 ? 50 : (i / (n - 1)) * 100);

  const isCritical = (v: number) => (direction === 'above' ? v > limit : v < limit);

  const last = n > 0 ? values[n - 1] : null;
  const lastCritical = last !== null && isCritical(last);

  const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(2)},${toY(v).toFixed(2)}`).join(' ');
  const area = n > 1 ? `${path} L100,${H} L0,${H} Z` : '';

  const limitY = toY(limit);
  const p = limitY / H;
  // Danger zone is above the limit line for 'above', below it for 'below'
  const zoneY = direction === 'above' ? 0 : limitY;
  const zoneH = direction === 'above' ? limitY : H - limitY;
  // The line is red only on the danger side of the threshold, blue everywhere else
  const topColor = direction === 'above' ? BAD : OK;
  const bottomColor = direction === 'above' ? OK : BAD;

  return (
    <div className="vt-track">
      <div className="vt-track-head">
        <span className="vt-label">{label}</span>
        <span className={`vt-value ${last === null ? '' : lastCritical ? 'critical' : 'nominal'}`}>
          {last === null ? '--' : last}
          <span className="vt-unit">{unit}</span>
        </span>
      </div>

      <div className="vt-plot">
        <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" role="img" aria-label={`${label} trend`}>
          <defs>
            <linearGradient id={`vt-grad-${key}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={H}>
              <stop offset={0} stopColor={topColor} />
              <stop offset={p} stopColor={topColor} />
              <stop offset={p} stopColor={bottomColor} />
              <stop offset={1} stopColor={bottomColor} />
            </linearGradient>
          </defs>
          <rect x="0" y={zoneY} width="100" height={zoneH} className="vt-zone" />
          <line x1="0" x2="100" y1={limitY} y2={limitY} className="vt-limit" />
          {area && <path d={area} className="vt-area" />}
          {path && <path d={path} className="vt-line" stroke={`url(#vt-grad-${key})`} />}
        </svg>

        {/* Dots are HTML so they stay circles even though the SVG is stretched */}
        {values.map((v, i) => (
          <span
            key={i}
            className={`vt-dot ${isCritical(v) ? 'critical' : ''} ${i === n - 1 ? 'last' : ''}`}
            style={{ left: `${toX(i)}%`, top: `${(toY(v) / H) * 100}%` }}
          />
        ))}

        <span className="vt-axis top">{max}</span>
        <span className="vt-axis bottom">{min}</span>
        <span className="vt-limit-label" style={{ top: `${p * 100}%` }}>
          {limit}
        </span>
        {n === 0 && <span className="vt-empty">Awaiting telemetry…</span>}
      </div>
    </div>
  );
}

export default function VitalsChart({ history }: { history: VitalsSample[] }) {
  return (
    <div className="vt-wrap">
      <Track label="Heart Rate" unit="BPM" values={history.map((s) => s.hr)} min={50} max={140} limit={100} direction="above" />
      <Track label="Blood O2 (SpO2)" unit="%" values={history.map((s) => s.spo2)} min={85} max={100} limit={95} direction="below" />
      <Track label="Systolic BP" unit="mmHg" values={history.map((s) => s.sys)} min={90} max={170} limit={140} direction="above" />
      <div className="vt-footnote">
        Last {history.length} readings, oldest → newest · dashed line = alert threshold · red = out of range
      </div>
    </div>
  );
}
