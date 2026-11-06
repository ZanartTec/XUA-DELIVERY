"use client";

import { useMemo, useState } from "react";
import { CONTACT, whatsappUrl } from "../_lib/site-config";
import { WhatsAppIcon } from "./icons";

const TYPES = ["Distribuidor", "Revendedor", "Ponto de venda / comércio"] as const;

/** Formulário que só monta a mensagem e abre o WhatsApp do comercial — não grava nada. */
export function DistributorForm() {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]>("Distribuidor");
  const [msg, setMsg] = useState("");

  const href = useMemo(() => {
    let txt = `Olá! Tenho interesse em ser ${type.toLowerCase()} da Água Mineral Xuá.`;
    if (name.trim()) txt += `\nNome: ${name.trim()}`;
    if (city.trim()) txt += `\nCidade/bairro: ${city.trim()}`;
    if (msg.trim()) txt += `\n${msg.trim()}`;
    return whatsappUrl(txt);
  }, [name, city, type, msg]);

  return (
    <form className="xs-form" data-reveal="right" onSubmit={(e) => e.preventDefault()} noValidate>
      <h3>Quero ser distribuidor</h3>
      <p className="xs-form-sub">Preencha e a conversa abre no WhatsApp com a sua mensagem pronta.</p>

      <label>
        Seu nome
        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Ex.: Maria Souza" />
      </label>
      <div className="xs-form-row">
        <label>
          Cidade / bairro
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ex.: Juiz de Fora, São Pedro" />
        </label>
        <label>
          Interesse
          <select value={type} onChange={(e) => setType(e.target.value as (typeof TYPES)[number])}>
            {TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Conte um pouco sobre você (opcional)
        <textarea
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="Ex.: já tenho depósito de gás e quero incluir água mineral."
        />
      </label>

      <a className="xs-btn xs-btn-wa" href={href} target="_blank" rel="noopener noreferrer">
        <WhatsAppIcon />
        Enviar pelo WhatsApp
      </a>
      <p className="xs-form-direct">
        Ou chame direto:{" "}
        <a href={whatsappUrl()} target="_blank" rel="noopener noreferrer">
          {CONTACT.whatsappDistribuidorLabel}
        </a>
      </p>
    </form>
  );
}
