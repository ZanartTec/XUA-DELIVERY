import { useId } from "react";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/src/components/ui/field";

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

/** Rótulo + controle + dica/erro, montados com o `Field` do shadcn. O controle recebe id e aria prontos. */
export function FormField({ label, error, hint, optional, className, children }: FormFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <Field data-invalid={error ? true : undefined} className={className}>
      <FieldLabel htmlFor={id}>
        {label}
        {optional ? <span className="font-normal text-muted-foreground">(opcional)</span> : null}
      </FieldLabel>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {hint && !error ? <FieldDescription id={hintId}>{hint}</FieldDescription> : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </Field>
  );
}
