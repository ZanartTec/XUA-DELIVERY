"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Skeleton } from "@/src/components/ui/skeleton";
import { PageHeader } from "@/src/components/shared/page-header";
import { FormField } from "@/src/components/shared/form-field";
import { MaskedInput } from "@/src/components/shared/masked-input";
import { StickyActionBar } from "@/src/components/shared/sticky-action-bar";
import { useAuthStore } from "@/src/store/auth";
import { normalizeUserRole } from "@/src/lib/role-utils";
import { api, ApiError } from "@/src/lib/api-client";
import { formatPhone, onlyDigits } from "@/src/lib/format";
import type { Consumer } from "@/src/types";

export default function ProfileEditPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);
  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<{ consumer: Consumer }>("/api/auth/me"),
  });
  const consumer = meQuery.data?.consumer;

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (consumer && !touched) {
      setName(consumer.name ?? "");
      setPhone(onlyDigits(consumer.phone));
    }
  }, [consumer, touched]);

  const nameError = touched && name.trim().length < 2 ? "Informe seu nome completo." : null;
  const phoneError = touched && phone.length > 0 && phone.length < 10 ? "Telefone incompleto." : null;
  const canSave = Boolean(consumer) && !nameError && !phoneError && name.trim().length >= 2 && !saving;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!consumer || !canSave) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.patch<Consumer>(`/api/consumers/${consumer.id}`, {
        name: name.trim(),
        ...(phone ? { phone: formatPhone(phone) } : {}),
      });
      queryClient.setQueryData(["me"], { consumer: { ...consumer, ...updated } });
      setUser({ id: consumer.id, name: updated.name, role: normalizeUserRole(consumer.role, "consumer") });
      toast.success("Dados atualizados");
      router.push("/profile");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro de conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader back="/profile" title="Dados pessoais" />

      {meQuery.isLoading ? (
        <div className="space-y-4 px-4">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : (
        <form id="profile-form" onSubmit={handleSubmit} className="grid gap-4 px-4" noValidate>
          <FormField label="Nome" error={nameError}>
            {(field) => (
              <Input
                {...field}
                value={name}
                autoComplete="name"
                onChange={(e) => {
                  setTouched(true);
                  setName(e.target.value);
                }}
                className="h-11 text-base md:text-sm"
              />
            )}
          </FormField>
          <FormField label="Telefone" error={phoneError}>
            {(field) => (
              <MaskedInput
                {...field}
                mask="phone"
                value={phone}
                onValueChange={(v) => {
                  setTouched(true);
                  setPhone(v);
                }}
                placeholder="(00) 00000-0000"
                className="h-11 text-base md:text-sm"
              />
            )}
          </FormField>
          <FormField label="E-mail" hint="O e-mail é usado para entrar e não pode ser alterado aqui.">
            {(field) => <Input {...field} value={consumer?.email ?? ""} readOnly disabled className="h-11 text-base md:text-sm" />}
          </FormField>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </form>
      )}

      <StickyActionBar>
        <Button type="submit" form="profile-form" variant="cta" size="xl" disabled={!canSave}>
          {saving ? "Salvando…" : "Salvar alterações"}
        </Button>
      </StickyActionBar>
    </div>
  );
}
