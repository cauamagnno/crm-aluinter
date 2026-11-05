"use client";

import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { formatBrMoney, maskBrMoney, parseBrMoney } from "@/lib/pt-format";
import { cn } from "@/lib/utils";

export function BrMoneyInput({
  value,
  onValueChange,
  onCommit,
  className,
  placeholder = "0,00",
  allowEmpty = false,
}: {
  value: number | null;
  onValueChange: (value: number | null) => void;
  onCommit?: (value: number | null) => void;
  className?: string;
  placeholder?: string;
  allowEmpty?: boolean;
}) {
  const [text, setText] = useState(() => (value == null ? "" : formatBrMoney(value)));

  useEffect(() => {
    setText((current) => {
      const parsed = parseBrMoney(current);
      if (value == null) return current.trim() ? current : "";
      if (parsed === value && current) return current;
      return formatBrMoney(value);
    });
  }, [value]);

  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-xs font-medium text-muted-foreground">
        R$
      </span>
      <Input
        inputMode="numeric"
        placeholder={placeholder}
        value={text}
        className={cn("pl-8", className)}
        onChange={(event) => {
          const next = maskBrMoney(event.target.value);
          setText(next);
          onValueChange(parseBrMoney(next));
        }}
        onBlur={() => {
          const parsed = parseBrMoney(text);
          if (parsed == null) {
            if (allowEmpty) {
              setText("");
              onValueChange(null);
              onCommit?.(null);
              return;
            }
            setText(formatBrMoney(0));
            onValueChange(0);
            onCommit?.(0);
            return;
          }
          setText(formatBrMoney(parsed));
          onValueChange(parsed);
          onCommit?.(parsed);
        }}
      />
    </div>
  );
}
