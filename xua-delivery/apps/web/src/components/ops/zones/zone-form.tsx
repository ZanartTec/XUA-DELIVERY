"use client";

import { useState } from "react";
import { Save, X } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { cn } from "@/src/lib/utils";
import { OPS_CTA, OPS_FIELD_LABEL, OPS_INPUT } from "./styles";

interface ZoneFormProps {
  title: string;
  initialName?: string;
  submitLabel: string;
  isSaving: boolean;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

/**
 * Formulário de criação/edição de zona. A distribuidora não é editável aqui:
 * na criação ela vem do contexto da tela, e mudá-la depois é transferência
 * (fluxo próprio, com guard de pedidos em aberto).
 */
export function ZoneForm({
  title,
  initialName = "",
  submitLabel,
  isSaving,
  onSubmit,
  onCancel,
}: ZoneFormProps) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Nome deve ter ao menos 2 caracteres");
      return;
    }
    setError(null);
    onSubmit(trimmed);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold font-heading">{title}</p>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancelar"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-1">
        <label htmlFor="zone-name" className={OPS_FIELD_LABEL}>
          Nome da zona *
        </label>
        <Input
          id="zone-name"
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
          placeholder="Ex: Zona Sul"
          aria-invalid={Boolean(error)}
          className={cn(OPS_INPUT, error && "border-red-400")}
        />
        {error && <p className="text-[11px] text-red-600">{error}</p>}
      </div>

      <div className="flex gap-2">
        <Button size="sm" disabled={isSaving} onClick={handleSubmit} className={OPS_CTA}>
          <Save className="mr-1 h-3.5 w-3.5" />
          {isSaving ? "Salvando..." : submitLabel}
        </Button>
        <Button size="sm" variant="ghost" className="rounded-xl" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
