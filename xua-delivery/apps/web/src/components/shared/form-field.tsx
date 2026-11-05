import { useId } from "react";
import { Label } from "@/src/components/ui/label";
import { cn } from "@/src/lib/utils";

interface FormFieldProps {
  label: React.ReactNode;
  /** Mensagem de erro; liga `aria-invalid`/`aria-describedby` no controle. */
  error?: string | null;
  hint?: React.ReactNode;
  optional?: boolean;
  className?: string;
  /** Recebe o id e os atributos de acessibilidade para repassar ao input. */
  children: (field: {
    id: string;
    "aria-invalid": boolean | undefined;
    "aria-describedby": string | undefined;
  }) => React.ReactNode;
}

export function FormField({ label, error, hint, optional, className, children }: FormFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div data-slot="form-field" className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {optional ? <span className="font-normal text-muted-foreground">(opcional)</span> : null}
      </Label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {hint && !error ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
