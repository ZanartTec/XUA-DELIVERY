"use client";

import { useEffect, useId, useRef, useState } from "react";
import { currentMotion } from "./scroll-effects";

const fmt = new Intl.NumberFormat("pt-BR");

/** Número que transita suavemente até o novo valor (rAF, ~450 ms). */
function Tween({ value }: { value: number }) {
  const ref = useRef<HTMLElement>(null);
  const shown = useRef(value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = shown.current;
    if (from === value || currentMotion() === "reduced") {
      shown.current = value;
      el.textContent = fmt.format(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 450);
      const v = Math.round(from + (value - from) * (1 - Math.pow(1 - p, 3)));
      shown.current = v;
      el.textContent = fmt.format(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <b ref={ref}>{fmt.format(value)}</b>;
}

/** Simulador: quanto plástico descartável a casa/empresa deixa de usar com o galão. */
export function HydrationCalc() {
  const [people, setPeople] = useState(4);
  const [days, setDays] = useState(30);
  // Cada mudança alterna a animação de "chacoalhar" o líquido das garrafinhas.
  const [kick, setKick] = useState(0);
  const id = useId();

  const liters = people * 2 * days;
  const gallons = Math.ceil(liters / 20);
  const bottlesYear = (liters * 12) / 0.5;
  const pct = ((people - 1) / 49) * 100;

  const changeDays = (d: number) => {
    if (d === days) return;
    setDays(d);
    setKick((k) => k + 1);
  };

  return (
    <div className="xs-calc" data-reveal="right">
      <h3>Quanto plástico você deixa de usar?</h3>
      <p className="xs-calc-sub">Simule para a sua casa ou empresa.</p>

      <div className="xs-field">
        <span className="xs-field-label" id={`${id}-place`}>
          Onde vocês bebem água?
        </span>
        <div className="xs-seg" role="group" aria-labelledby={`${id}-place`}>
          <span className="xs-seg-pill" style={{ transform: days === 30 ? "translateX(0)" : "translateX(100%)" }} aria-hidden />
          <button type="button" aria-pressed={days === 30} onClick={() => changeDays(30)}>
            Em casa
          </button>
          <button type="button" aria-pressed={days === 22} onClick={() => changeDays(22)}>
            No trabalho
          </button>
        </div>
      </div>

      <div className="xs-field">
        <label className="xs-field-label xs-range-label" htmlFor={`${id}-people`}>
          Pessoas <output htmlFor={`${id}-people`}>{people}</output>
        </label>
        <input
          id={`${id}-people`}
          className="xs-range"
          type="range"
          min={1}
          max={50}
          value={people}
          style={{ "--pct": `${pct}%` } as React.CSSProperties}
          onChange={(e) => {
            setPeople(Number(e.target.value));
            setKick((k) => k + 1);
          }}
        />
      </div>

      <p className="xs-sr" aria-live="polite">
        {fmt.format(liters)} litros por mês, {fmt.format(gallons)} galões por mês e {fmt.format(bottlesYear)} garrafinhas
        a menos por ano.
      </p>
      <div className="xs-results" aria-hidden>
        <div>
          <Tween value={liters} />
          litros por mês
        </div>
        <div>
          <Tween value={gallons} />
          galões Xuá por mês
        </div>
        <div className="is-hl">
          <Tween value={bottlesYear} />
          garrafinhas a menos por ano
        </div>
      </div>

      <div className="xs-bottles" data-kick={kick === 0 ? undefined : kick % 2} aria-hidden>
        {Array.from({ length: 40 }, (_, i) => (
          <i key={i} style={{ "--i": i } as React.CSSProperties} />
        ))}
      </div>
      <p className="xs-calc-note">
        Cada galão de 20 litros equivale a 40 garrafinhas de 500 ml (a fileira acima). Estimativa com 2 litros por pessoa
        por dia, considerando {days} dias no mês.
      </p>
    </div>
  );
}
