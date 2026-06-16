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
  const cashOk = methods ? methods.accepts_cash_on_delivery : true;
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
export function useDistributorPaymentMethods(distributorId: string | null) {
  const [methods, setMethods] = useState<DistributorPaymentMethodsPublic | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!distributorId) {
      setMethods(NO_DISTRIBUTOR_FALLBACK);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/distributors/${distributorId}/payment-methods`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: DistributorPaymentMethodsPublic) => {
        if (!cancelled) setMethods(data);
      })
      .catch(() => {
        if (!cancelled) setMethods(NO_DISTRIBUTOR_FALLBACK);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [distributorId]);

  return { methods, loading };
}
