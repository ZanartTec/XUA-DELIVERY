/**
 * Muda que brota quando o cartão aparece: o caule se desenha e as folhas abrem.
 * SVG puro animado por CSS (.xs-sprout em site.css).
 */
export function Sprout() {
  return (
    <svg className="xs-sprout" viewBox="0 0 64 64" fill="none" aria-hidden>
      <path className="xs-sprout-soil" d="M14 58c6-4 30-4 36 0" pathLength={1} />
      <path className="xs-sprout-stem" d="M32 58V30" pathLength={1} />
      <path className="xs-sprout-leaf is-l" d="M32 40c-2-9-10-14-20-13 1 9 9 15 20 13z" />
      <path className="xs-sprout-leaf is-r" d="M32 32c2-10 10-16 22-15-1 11-10 17-22 15z" />
    </svg>
  );
}
