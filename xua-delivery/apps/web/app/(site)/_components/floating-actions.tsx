"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CONTACT, DISTRIBUIDOR_MSG, whatsappUrl } from "../_lib/site-config";
import { DropIcon, PhoneIcon, SmartphoneIcon, WhatsAppIcon } from "./icons";

/** Botão flutuante (canto inferior direito) que abre os atalhos de pedido e contato. */
export function FloatingActions() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={ref} className={`xs-fab${open ? " is-open" : ""}`}>
      <div className="xs-fab-menu" id="xs-fab-menu" aria-hidden={!open}>
        <Link href={CONTACT.appRegister} prefetch={false} onClick={close} tabIndex={open ? 0 : -1} style={{ "--i": 2 } as React.CSSProperties}>
          <span>
            Pedir pelo app<small>Receba em casa</small>
          </span>
          <span className="xs-fi" style={{ background: "var(--navy)" }}>
            <SmartphoneIcon />
          </span>
        </Link>
        <a href={`tel:${CONTACT.phoneFonte}`} onClick={close} tabIndex={open ? 0 : -1} style={{ "--i": 1 } as React.CSSProperties}>
          <span>
            Ligar para a fonte<small>{CONTACT.phoneFonteLabel}</small>
          </span>
          <span className="xs-fi" style={{ background: "#3a63b8" }}>
            <PhoneIcon />
          </span>
        </a>
        <a
          href={whatsappUrl(DISTRIBUIDOR_MSG)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={close}
          tabIndex={open ? 0 : -1}
          style={{ "--i": 0 } as React.CSSProperties}
        >
          <span>
            Quero distribuir<small>WhatsApp {CONTACT.whatsappDistribuidorLabel}</small>
          </span>
          <span className="xs-fi" style={{ background: "#1fa855" }}>
            <WhatsAppIcon />
          </span>
        </a>
      </div>
      <span className="xs-fab-label" aria-hidden>
        Peça sua Xuá
      </span>
      <button
        type="button"
        className="xs-fab-toggle"
        aria-expanded={open}
        aria-controls="xs-fab-menu"
        aria-label={open ? "Fechar atalhos" : "Abrir atalhos de pedido e contato"}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <DropIcon />
      </button>
    </div>
  );
}
