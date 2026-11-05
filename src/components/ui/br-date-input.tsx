"use client";

import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { formatIsoAsBrDate, maskBrDate, parseBrDate } from "@/lib/pt-format";

export function BrDateInput({
  value,
  onValueChange,
  onCommit,
  className,
  placeholder = "dd/mm/aaaa",
  "aria-label": ariaLabel,
}: {
  value: string;
  onValueChange: (iso: string) => void;
  onCommit?: (iso: string) => void;
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
}) {
  const [text, setText] = useState(() => formatIsoAsBrDate(value));

  useEffect(() => {
    setText((current) => {
      if (parseBrDate(current) === (value || "") && current) return current;
      return formatIsoAsBrDate(value);
    });
  }, [value]);

  return (
    <Input
      inputMode="numeric"
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={text}
      className={className}
      onChange={(event) => {
        const next = maskBrDate(event.target.value);
        setText(next);
        if (!next) onValueChange("");
        const iso = parseBrDate(next);
        if (iso) onValueChange(iso);
      }}
      onBlur={() => {
        if (!text.trim()) {
          setText("");
          onValueChange("");
          onCommit?.("");
          return;
        }
        const iso = parseBrDate(text);
        if (!iso) {
          setText(formatIsoAsBrDate(value));
          return;
        }
        setText(formatIsoAsBrDate(iso));
        onValueChange(iso);
        onCommit?.(iso);
      }}
    />
  );
}
