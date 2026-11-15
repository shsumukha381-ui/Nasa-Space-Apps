import { useId } from 'react';
import type { VitalsSample } from './api';
import './VitalsChart.css';

export type { VitalsSample } from './api';

interface Metric {
  key: keyof VitalsSample;
  label: string;
  unit: string;
  min: number;
  max: number;
  interval: number;
  threshold: number;
  operator: '>' | '<' | '≥';
}

const METRICS: Metric[] = [
  { key: 'hr', label: 'Heart rate', unit: 'bpm', min: 50, max: 140, interval: 10, threshold: 100, operator: '>' },
  { key: 'spo2', label: 'Oxygen saturation', unit: '%', min: 85, max: 100, interval: 5, threshold: 95, operator: '<' },
  { key: 'sys', label: 'Systolic pressure', unit: 'mmHg', min: 90, max: 170, interval: 10, threshold: 140, operator: '≥' },
  { key: 'dia', label: 'Diastolic pressure', unit: 'mmHg', min: 60, max: 110, interval: 10, threshold: 90, operator: '≥' },
];

const WIDTH = 100;
const HEIGHT = 40;
const INSET = 2;

function isOutsideThreshold(value: number, metric: Metric) {
  if (metric.operator === '<') return value < metric.threshold;
  if (metric.operator === '≥') return value >= metric.threshold;
  return value > metric.threshold;
}

function Track({ metric, values }: { metric: Metric; values: number[] }) {
  const gradientId = useId();
  const { label, unit, interval, operator, threshold } = metric;
  const first = values[0];
  const last = values.at(-1);
  const outOfRange = last !== undefined && isOutsideThreshold(last, metric);
  const min = Math.floor(Math.min(metric.min, ...values) / interval) * interval;
  const max = Math.ceil(Math.max(metric.max, ...values) / interval) * interval;
  const toY = (value: number) => INSET + ((max - value) / (max - min)) * (HEIGHT - 2 * INSET);
  const toX = (index: number) => values.length < 2 ? WIDTH - INSET : INSET + index / (values.length - 1) * (WIDTH - 2 * INSET);
  const path = values.map((value, index) => `${index === 0 ? 'M' : 'L'}${toX(index)},${toY(value)}`).join(' ');
  const area = values.length > 1 ? `${path} L${WIDTH - INSET},${HEIGHT} L${INSET},${HEIGHT} Z` : undefined;
  const thresholdY = toY(threshold);
  const lowerZone = operator === '<';
  const upperColor = lowerZone ? 'var(--vitals-accent)' : 'var(--vitals-alert)';
  const lowerColor = lowerZone ? 'var(--vitals-alert)' : 'var(--vitals-accent)';
  const trend = values.length > 1 ? `From ${first} to ${last} ${unit}.` : `One reading at ${last} ${unit}.`;

  return (
    <figure className="vt-track">
      <figcaption className="vt-track-head">
        <span className="vt-label">{label}</span>
        <span className={`vt-value${outOfRange ? ' vt-value-alert' : ''}`}>
          {last === undefined ? '—' : last}
          <span className="vt-unit">{unit}</span>
        </span>
      </figcaption>
      <div className="vt-chart-row">
        <div className="vt-plot" role="img" aria-label={`${label}. ${last === undefined ? 'Awaiting telemetry.' : trend}`}>
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={HEIGHT}>
                <stop offset={0} stopColor={upperColor} />
                <stop offset={thresholdY / HEIGHT} stopColor={upperColor} />
                <stop offset={thresholdY / HEIGHT} stopColor={lowerColor} />
                <stop offset={1} stopColor={lowerColor} />
              </linearGradient>
            </defs>
            <rect className="vt-zone" x="0" y={lowerZone ? thresholdY : 0} width={WIDTH} height={lowerZone ? HEIGHT - thresholdY : thresholdY} />
            <line className="vt-limit" x1="0" x2={WIDTH} y1={thresholdY} y2={thresholdY} />
            {area && <path className="vt-area" d={area} />}
            {values.length > 1 && <path className="vt-line" d={path} stroke={`url(#${gradientId})`} />}
          </svg>
          {last === undefined ? (
            <span className="vt-empty" aria-hidden="true">Awaiting telemetry</span>
          ) : (
            <span
              className={`vt-marker${outOfRange ? ' vt-marker-alert' : ''}`}
              style={{ left: `${toX(values.length - 1)}%`, top: `${toY(last) / HEIGHT * 100}%` }}
              aria-hidden="true"
            />
          )}
        </div>
        <div className="vt-axis" aria-hidden="true"><span>{max}</span><span>{min}</span></div>
      </div>
      <div className="vt-threshold">
        <span className="vt-limit-key" aria-hidden="true" />
        <span>Alert {operator} {threshold} {unit}</span>
        {outOfRange && <strong>Outside threshold</strong>}
      </div>
    </figure>
  );
}

export default function VitalsChart({ history }: { history: VitalsSample[] }) {
  return (
    <div className="vt-wrap">
      <div className="vt-grid">
        {METRICS.map((metric) => <Track key={metric.key} metric={metric} values={history.map((sample) => sample[metric.key])} />)}
      </div>
      <div className="vt-footnote">
        <span>{history.length} {history.length === 1 ? 'reading' : 'readings'}</span>
        {history.length > 1 && <span>Oldest to latest <span aria-hidden="true">→</span></span>}
      </div>
    </div>
  );
}
