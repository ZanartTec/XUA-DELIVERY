import { useId } from "react";

/**
 * Gota com volume (gradiente + brilho especular) que pinga e respinga.
 * SVG puro animado por CSS (.xs-drip em site.css): sem JS, só transform/opacity.
 */
export function DripDrop({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={`xs-drip${className ? ` ${className}` : ""}`} viewBox="0 0 24 32" aria-hidden>
      <defs>
        <radialGradient id={`${id}g`} cx="36%" cy="40%" r="72%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#d9eefc" />
          <stop offset="1" stopColor="#86bdea" />
        </radialGradient>
      </defs>
      <ellipse className="xs-drip-ring" cx="12" cy="29.5" rx="7" ry="1.6" />
      <g className="xs-drip-body">
        <path d="M12 2c3.4 4.6 7 8.3 7 12.4a7 7 0 0 1-14 0C5 10.3 8.6 6.6 12 2z" fill={`url(#${id}g)`} />
        <ellipse cx="9.4" cy="13.8" rx="1.5" ry="2.7" fill="#fff" opacity="0.9" transform="rotate(-22 9.4 13.8)" />
      </g>
    </svg>
  );
}
