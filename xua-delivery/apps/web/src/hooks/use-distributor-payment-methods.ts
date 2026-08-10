"use client";

import { useEffect, useState } from "react";
import type { CheckoutPaymentMethod } from "@xua/shared/enums";
import type { DistributorPaymentMethodsPublic } from "@xua/shared/schemas/distributor-payment-settings";

/**
 * Métodos a esconder no checkout dada a capacidade da distribuidora. Enquanto
 * carrega (methods null) é conservador: esconde os métodos online + maquininha
 * para nunca exibir opção indisponível por um instante.
 */
export function hiddenCheckoutMethods(
  methods: DistributorPaymentMethodsPublic | null,
): CheckoutPaymentMethod[] {
  const hidden: CheckoutPaymentMethod[] = [];
  const pixOk = Boolean(methods?.mp_connected && methods.accepts_pix_online);
  const creditOk = Boolean(methods?.mp_connected && methods.accepts_credit_online);
  const cashOk = methods ? methods.accepts_cash_on_delivery : false;
  const cardOk = methods ? methods.accepts_card_on_delivery : false;
  if (!pixOk) hidden.push("pix");
  if (!creditOk) hidden.push("credit");
  if (!cashOk) hidden.push("cash");
  if (!cardOk) hidden.push("card_on_delivery");
  return hidden;
}

/** Sem distribuidora selecionada não há gateway resolvível: só métodos offline. */
const NO_DISTRIBUTOR_FALLBACK: DistributorPaymentMethodsPublic = {
  accepts_pix_online: false,
  accepts_credit_online: false,
  accepts_cash_on_delivery: true,
  accepts_card_on_delivery: false,
  mp_connected: false,
};

/**
 * Busca as capacidades de pagamento (métodos aceitos + mp_connected) da
 * distribuidora escolhida, para o checkout exibir só o que ela aceita.
 */
interface FetchResult {
  distributorId: string;
  methods: DistributorPaymentMethodsPublic;
}

export function useDistributorPaymentMethods(distributorId: string | null) {
  // `loading` e "o resultado é da distribuidora atual?" são derivados na
  // renderização comparando com `distributorId` — o efeito só toca estado
  // dentro do .then()/.catch(), nunca de forma síncrona no corpo dele.
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    if (!distributorId) return;

    let cancelled = false;
    fetch(`/api/distributors/${distributorId}/payment-methods`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: DistributorPaymentMethodsPublic) => {
        if (!cancelled) setResult({ distributorId, methods: data });
      })
      .catch(() => {
        if (!cancelled) setResult({ distributorId, methods: NO_DISTRIBUTOR_FALLBACK });
      });
    return () => {
      cancelled = true;
    };
  }, [distributorId]);

  if (!distributorId) return { methods: NO_DISTRIBUTOR_FALLBACK, loading: false };

  const isCurrent = result?.distributorId === distributorId;
  return {
    methods: isCurrent ? result.methods : null,
    loading: !isCurrent,
  };
}
