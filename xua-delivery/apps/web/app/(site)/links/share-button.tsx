"use client";

import { useState } from "react";
import { ShareIcon } from "../_components/icons";

/** Compartilha a página de links (menu nativo no celular; copia o endereço no desktop). */
export function ShareButton() {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = window.location.href;
    const data = { title: "Água Mineral Xuá", text: "Peça sua Água Mineral Xuá", url };
    try {
      if (navigator.share) {
        await navigator.share(data);
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // usuário cancelou o compartilhamento
    }
  };

  return (
    <button type="button" className="xl-share" onClick={share}>
      <ShareIcon />
      {copied ? "Link copiado!" : "Compartilhar"}
    </button>
  );
}
