"use client";

import { useRef, useState, KeyboardEvent, ClipboardEvent } from "react";
import { cn } from "@/src/lib/utils";
import { Input } from "@/src/components/ui/input";

interface OtpInputProps {
  length?: number;
  onComplete: (code: string) => void;
  disabled?: boolean;
  className?: string;
}

export function OtpInput({
  length = 6,
  onComplete,
  disabled = false,
  className,
}: OtpInputProps) {
  const [values, setValues] = useState<string[]>(Array(length).fill(""));
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  function focusIndex(i: number) {
    refs.current[i]?.focus();
  }

  function handleChange(index: number, val: string) {
    if (!/^\d?$/.test(val)) return;
    const next = [...values];
    next[index] = val;
    setValues(next);

    if (val && index < length - 1) {
      focusIndex(index + 1);
    }

    if (next.every((v) => v !== "")) {
      onComplete(next.join(""));
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !values[index] && index > 0) {
      focusIndex(index - 1);
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!text) return;
    const next = [...values];
    for (let i = 0; i < text.length; i++) {
      next[i] = text[i];
    }
    setValues(next);
    focusIndex(Math.min(text.length, length - 1));
    if (next.every((v) => v !== "")) {
      onComplete(next.join(""));
    }
  }

  return (
    <div className={cn("flex gap-2 justify-center", className)}>
      {values.map((val, i) => (
        <Input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={val}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={i === 0 ? handlePaste : undefined}
          className="w-12 h-14 text-center text-2xl font-mono"
        />
      ))}
    </div>
  );
}
