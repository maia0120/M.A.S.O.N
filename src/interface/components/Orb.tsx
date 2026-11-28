import { useCoreMode, MODE_LABEL } from './coreState';

/**
 * Núcleo do MASON: um orbe com anéis em SVG e brilho em CSS.
 * Cada estado tem um movimento próprio (veja .orb[data-mode=...] em styles.css).
 */
export function Orb({ size = 180, onClick, showLabel = false }: { size?: number; onClick?: () => void; showLabel?: boolean }) {
  const mode = useCoreMode();
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      className={`orb ${showLabel ? 'has-label' : ''}`}
      data-mode={mode}
      style={{ width: size, height: size }}
      onClick={onClick}
      aria-label={onClick ? `Falar com o MASON (${MODE_LABEL[mode]})` : `MASON: ${MODE_LABEL[mode]}`}
    >
      <span className="orb-glow" />
      <svg className="orb-rings" viewBox="0 0 200 200" aria-hidden="true">
        <circle className="ring ring-outer" cx="100" cy="100" r="94" />
        <circle className="ring ring-dash" cx="100" cy="100" r="84" />
        <circle className="ring ring-arc" cx="100" cy="100" r="74" />
        <circle className="ring ring-arc2" cx="100" cy="100" r="64" />
        <g className="ring-ticks">
          {Array.from({ length: 36 }, (_, i) => (
            <line key={i} x1="100" y1="4" x2="100" y2={i % 3 === 0 ? 12 : 8} transform={`rotate(${i * 10} 100 100)`} />
          ))}
        </g>
      </svg>
      <span className="orb-core" />
      <span className="orb-wave w1" />
      <span className="orb-wave w2" />
      <span className="orb-wave w3" />
      {showLabel && <span className="orb-label">{MODE_LABEL[mode]}</span>}
    </Tag>
  );
}
