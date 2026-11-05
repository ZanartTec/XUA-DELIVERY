"use client";

import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import { useAuthStore } from "@/src/store/auth";
import { useCheckoutStore } from "@/src/store/checkout";
import type { Address } from "@/src/types";

export const addressesQueryKey = (consumerId: string | undefined) => ["consumer-addresses", consumerId] as const;

export interface NewAddressInput {
  label?: string;
  zip_code: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  is_default?: boolean;
}

export interface AddressPatch {
  label?: string | null;
  number?: string;
  complement?: string | null;
  is_default?: true;
}

/** Endereços do consumidor logado (fonte única para header, perfil e checkout). */
export function useAddresses() {
  const consumerId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: addressesQueryKey(consumerId),
    queryFn: async () =>
      (await api.get<{ addresses: Address[] }>(`/api/consumers/${consumerId}/addresses`)).addresses,
    enabled: Boolean(consumerId),
    staleTime: 60_000,
  });
}

/**
 * Endereço de entrega selecionado. Guardado no checkout store; quando ainda não
 * há escolha (ou o escolhido foi excluído) cai no principal/primeiro — assim o
 * header já mostra o endereço logo após o primeiro cadastro (C-01).
 */
export function useSelectedAddress() {
  const { data: addresses, isLoading } = useAddresses();
  const selectedId = useCheckoutStore((s) => s.selectedAddressId);
  const setSelectedId = useCheckoutStore((s) => s.setSelectedAddressId);

  const selected = useMemo(() => {
    if (!addresses?.length) return null;
    return (
      addresses.find((a) => a.id === selectedId) ??
      addresses.find((a) => a.is_default) ??
      addresses[0]
    );
  }, [addresses, selectedId]);

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId, setSelectedId]);

  return { address: selected, addresses: addresses ?? [], isLoading, select: setSelectedId };
}

export function useAddressMutations() {
  const consumerId = useAuthStore((s) => s.user?.id);
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: addressesQueryKey(consumerId) });
  const base = `/api/consumers/${consumerId}/addresses`;

  const create = useMutation({
    mutationFn: async (input: NewAddressInput) => (await api.post<{ address: Address }>(base, input)).address,
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: AddressPatch }) =>
      (await api.patch<{ address: Address }>(`${base}/${id}`, patch)).address,
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete<void>(`${base}/${id}`),
    onSuccess: invalidate,
  });

  return { create, update, remove };
}

/** "Rua X, 123 — apto 4" */
export function formatAddressLine(a: Pick<Address, "street" | "number" | "complement">) {
  return `${a.street}, ${a.number}${a.complement ? ` — ${a.complement}` : ""}`;
}
