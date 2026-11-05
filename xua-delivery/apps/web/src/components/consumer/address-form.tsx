"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MapPin } from "lucide-react";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/src/components/ui/toggle-group";
import { FormField } from "@/src/components/shared/form-field";
import { MaskedInput } from "@/src/components/shared/masked-input";
import { ApiError, api } from "@/src/lib/api-client";
import { useAddressMutations } from "@/src/hooks/consumer/use-addresses";
import type { Address } from "@/src/types";

interface CepData {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

const LABEL_PRESETS = ["Casa", "Trabalho"] as const;

interface AddressFormProps {
  /** Edição: só apelido, número e complemento (rua/CEP ficam presos ao histórico de pedidos). */
  address?: Address;
  onSaved: (address: Address) => void;
  onCancel?: () => void;
}

/** Cadastro/edição de endereço — único para o seletor do header e o perfil. */
export function AddressForm({ address, onSaved, onCancel }: AddressFormProps) {
  const isEdit = Boolean(address);
  const { create, update } = useAddressMutations();

  const [cep, setCep] = useState("");
  const [number, setNumber] = useState(address?.number ?? "");
  const [complement, setComplement] = useState(address?.complement ?? "");
  const [label, setLabel] = useState(address?.label ?? "");
  const [error, setError] = useState<string | null>(null);

  // Busca o CEP sozinho ao completar 8 dígitos.
  const cepQuery = useQuery({
    queryKey: ["cep", cep],
    queryFn: () => api.get<CepData & { error?: string }>(`/api/consumers/cep/${cep}`),
    enabled: !isEdit && cep.length === 8,
    retry: false,
    staleTime: Infinity,
  });
  const cepComplete = !isEdit && cep.length === 8;
  const cepData: CepData | null =
    cepComplete && cepQuery.data && !cepQuery.data.error
      ? {
          street: cepQuery.data.street,
          neighborhood: cepQuery.data.neighborhood,
          city: cepQuery.data.city,
          state: cepQuery.data.state,
        }
      : null;
  const cepLoading = cepComplete && cepQuery.isFetching;
  const cepError = !cepComplete
    ? null
    : cepQuery.data?.error ??
      (cepQuery.error ? (cepQuery.error instanceof ApiError ? cepQuery.error.message : "Não foi possível buscar o CEP.") : null);

  const pending = create.isPending || update.isPending;
  const canSubmit = number.trim().length > 0 && (isEdit || cepData !== null) && !pending;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      const saved = address
        ? await update.mutateAsync({
            id: address.id,
            patch: { label: label.trim() || null, number: number.trim(), complement: complement.trim() || null },
          })
        : await create.mutateAsync({
            label: label.trim() || undefined,
            zip_code: cep,
            street: cepData!.street,
            number: number.trim(),
            complement: complement.trim() || undefined,
            neighborhood: cepData!.neighborhood,
            city: cepData!.city,
            state: cepData!.state,
          });
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError && err.code === "NO_COVERAGE") {
        setError("Ainda não entregamos nessa região.");
      } else {
        setError(err instanceof ApiError ? err.message : "Não foi possível salvar o endereço.");
      }
    }
  }

  const place = address ?? cepData;

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      {!isEdit ? (
        <FormField label="CEP" hint="A rua é preenchida automaticamente.">
          {(field) => (
            <div className="relative">
              <MaskedInput
                {...field}
                mask="cep"
                value={cep}
                onValueChange={setCep}
                placeholder="00000-000"
                className="h-11"
                autoFocus
              />
              {cepLoading ? (
                <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              ) : null}
            </div>
          )}
        </FormField>
      ) : null}

      {place ? (
        <div className="flex items-start gap-2 rounded-xl bg-surface-low p-3 text-sm">
          <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <p className="text-foreground">
            {place.street}, {place.neighborhood}
            <span className="block text-muted-foreground">
              {place.city}/{place.state}
              {address ? ` · CEP ${address.zip_code}` : null}
            </span>
          </p>
        </div>
      ) : null}

      {place ? (
        <>
          <div className="grid grid-cols-[7rem_1fr] gap-3">
            <FormField label="Número">
              {(field) => (
                <Input
                  {...field}
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  inputMode="numeric"
                  className="h-11"
                  required
                />
              )}
            </FormField>
            <FormField label="Complemento" optional>
              {(field) => (
                <Input
                  {...field}
                  value={complement}
                  onChange={(e) => setComplement(e.target.value)}
                  placeholder="Apto, bloco, referência"
                  className="h-11"
                />
              )}
            </FormField>
          </div>

          <FormField label="Apelido" optional>
            {(field) => (
              <div className="grid gap-2">
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={LABEL_PRESETS.includes(label as (typeof LABEL_PRESETS)[number]) ? label : ""}
                  onValueChange={(v) => setLabel(v)}
                  className="justify-start"
                >
                  {LABEL_PRESETS.map((preset) => (
                    <ToggleGroupItem key={preset} value={preset} className="h-9 px-4">
                      {preset}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <Input
                  {...field}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Ou digite um nome (ex.: Casa da mãe)"
                  maxLength={40}
                  className="h-11"
                />
              </div>
            )}
          </FormField>
        </>
      ) : null}

      {error ?? cepError ? (
        <Alert variant="destructive">
          <AlertDescription>{error ?? cepError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button type="button" variant="ghost" size="xl" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" variant="cta" size="xl" disabled={!canSubmit}>
          {pending ? "Salvando…" : isEdit ? "Salvar alterações" : "Salvar endereço"}
        </Button>
      </div>
    </form>
  );
}
