import { Settings } from 'lucide-react';
import { type Inputs, DEFAULT_INPUTS } from './engine';
import { useState } from 'react';

interface Props {
  inputs: Inputs;
  onChange: (inputs: Inputs) => void;
}

const PRESETS = [
  { label: 'Nominal', values: DEFAULT_INPUTS },
  { label: 'Radiation storm', values: { ...DEFAULT_INPUTS, radiation: 92 } },
  { label: 'Scrubber failure', values: { ...DEFAULT_INPUTS, co2: 4800 } },
  { label: 'Mars transit', values: { co2: 1500, radiation: 55, days: 400, sleep: 6 } },
  { label: 'Perfect storm', values: { co2: 4800, radiation: 95, days: 400, sleep: 4 } },
];

export default function SandboxPanel({ inputs, onChange }: Props) {
  // Track which preset was clicked last
  const [activePreset, setActivePreset] = useState<string>('Nominal');

  const handleSliderChange = (key: keyof Inputs, value: number) => {
    setActivePreset(''); // Clear active preset if user manually drags a slider
    onChange({ ...inputs, [key]: value });
  };

  const handlePresetClick = (label: string, values: Inputs) => {
    setActivePreset(label);
    onChange(values);
  };

  // Helper to calculate percentage for the CSS slider fill track
  const getPercent = (val: number, min: number, max: number) => {
    return Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
  };

  return (
    <div className="panel" style={{ flex: 'none', marginBottom: '1.5rem' }}>
      <div className="panel-header">
        <Settings size={16} /> JUDGE'S SANDBOX
      </div>

      <div className="sb-presets">
        {PRESETS.map((p) => (
          <button 
            key={p.label} 
            className={`sb-preset ${activePreset === p.label ? 'active' : ''}`}
            onClick={() => handlePresetClick(p.label, p.values)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem 2rem' }}>
        
        <div className={`sandbox-control ${inputs.co2 > 2000 ? 'danger' : ''}`}>
          <label>Cabin CO₂ <span>{inputs.co2} ppm</span></label>
          <style>{`.co2-slider::before { width: ${getPercent(inputs.co2, 400, 5000)}%; }`}</style>
          <input
            className="co2-slider"
            type="range" min="400" max="5000" step="100"
            value={inputs.co2}
            onChange={(e) => handleSliderChange('co2', Number(e.target.value))}
          />
        </div>

        <div className={`sandbox-control ${inputs.radiation > 15 ? 'danger' : ''}`}>
          <label>Solar Radiation Flux <span>{inputs.radiation} idx</span></label>
          <style>{`.rad-slider::before { width: ${getPercent(inputs.radiation, 0, 100)}%; }`}</style>
          <input
            className="rad-slider"
            type="range" min="0" max="100" step="1"
            value={inputs.radiation}
            onChange={(e) => handleSliderChange('radiation', Number(e.target.value))}
          />
        </div>

        <div className={`sandbox-control ${inputs.days > 90 ? 'danger' : ''}`}>
          <label>Days in Space <span>{inputs.days} d</span></label>
          <style>{`.days-slider::before { width: ${getPercent(inputs.days, 0, 1000)}%; }`}</style>
          <input
            className="days-slider"
            type="range" min="0" max="1000" step="10"
            value={inputs.days}
            onChange={(e) => handleSliderChange('days', Number(e.target.value))}
          />
        </div>

        <div className={`sandbox-control ${inputs.sleep < 6 ? 'danger' : ''}`}>
          <label>Hours of Sleep <span>{inputs.sleep} h</span></label>
          <style>{`.sleep-slider::before { width: ${getPercent(inputs.sleep, 2, 10)}%; }`}</style>
          <input
            className="sleep-slider"
            type="range" min="2" max="10" step="0.5"
            value={inputs.sleep}
            onChange={(e) => handleSliderChange('sleep', Number(e.target.value))}
          />
        </div>

      </div>
    </div>
  );
}