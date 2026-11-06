"use client";

import { useId, useState } from "react";

const fmt = new Intl.NumberFormat("pt-BR");

/** Simulador: quanto plástico descartável a casa/empresa deixa de usar com o galão. */
export function HydrationCalc() {
  const [people, setPeople] = useState(4);
  const [days, setDays] = useState(30);
  const id = useId();

  const liters = people * 2 * days;
  const gallons = Math.ceil(liters / 20);
  const bottlesYear = (liters * 12) / 0.5;
  const pct = ((people - 1) / 49) * 100;

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
          <button type="button" aria-pressed={days === 30} onClick={() => setDays(30)}>
            Em casa
          </button>
          <button type="button" aria-pressed={days === 22} onClick={() => setDays(22)}>
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
          onChange={(e) => setPeople(Number(e.target.value))}
        />
      </div>

      <div className="xs-results" aria-live="polite">
        <div>
          <b>{fmt.format(liters)}</b>litros por mês
        </div>
        <div>
          <b>{fmt.format(gallons)}</b>galões Xuá por mês
        </div>
        <div className="is-hl">
          <b>{fmt.format(bottlesYear)}</b>garrafinhas a menos por ano
        </div>
      </div>

      <div className="xs-bottles" aria-hidden>
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
