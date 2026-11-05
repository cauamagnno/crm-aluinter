"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const EMPTY = "__empty__";

export type FieldOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export function FieldSelect({
  value,
  onValueChange,
  options = [],
  groups = [],
  placeholder,
  disabled,
  className,
  id,
  "aria-label": ariaLabel,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options?: FieldOption[];
  groups?: { label: string; options: FieldOption[] }[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
}) {
  const flat = [...options, ...groups.flatMap((group) => group.options)];
  const encoded = value === "" ? EMPTY : value;
  const current = flat.find((option) => (option.value === "" ? EMPTY : option.value) === encoded);

  return (
    <Select
      value={flat.length ? encoded : undefined}
      onValueChange={(next) => {
        if (!next) return;
        onValueChange(next === EMPTY ? "" : next);
      }}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        className={cn("h-9 w-full border-border bg-card text-foreground", className)}
      >
        <SelectValue placeholder={placeholder}>{current?.label ?? placeholder}</SelectValue>
      </SelectTrigger>
      <SelectContent align="start" className="max-h-72">
        {options.map((option) => (
          <SelectItem
            key={option.value || EMPTY}
            value={option.value || EMPTY}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
        {groups.map((group) => (
          <SelectGroup key={group.label}>
            <SelectLabel>{group.label}</SelectLabel>
            {group.options.map((option) => (
              <SelectItem key={option.value || EMPTY} value={option.value || EMPTY}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
