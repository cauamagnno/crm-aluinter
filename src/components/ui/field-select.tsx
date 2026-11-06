"use client";

import { useMemo, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  /** Extra text included when `searchable` filters the list. */
  keywords?: string;
  disabled?: boolean;
};

function fold(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function FieldSelect({
  value,
  onValueChange,
  options = [],
  groups = [],
  placeholder,
  disabled,
  searchable,
  searchPlaceholder,
  emptyLabel,
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
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyLabel?: string;
  className?: string;
  id?: string;
  "aria-label"?: string;
}) {
  const flat = [...options, ...groups.flatMap((group) => group.options)];
  const encoded = value === "" ? EMPTY : value;
  const current = flat.find((option) => (option.value === "" ? EMPTY : option.value) === encoded);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const needle = fold(query.trim());
    if (!needle) return options;
    return options.filter((option) => {
      if (!option.value) return false;
      return fold(`${option.label} ${option.keywords ?? ""}`).includes(needle);
    });
  }, [options, query]);

  if (searchable) {
    return (
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger
          id={id}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-1.5 rounded-lg border border-border bg-card px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
            !current?.value && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{current?.value ? current.label : placeholder}</span>
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          positionerClassName="z-[80]"
          className="w-(--anchor-width) gap-1 p-1"
        >
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-8 border-border bg-muted text-foreground"
          />
          <div className="max-h-60 overflow-y-auto">
            {visible.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">{emptyLabel}</p>
            ) : (
              visible.map((option) => (
                <button
                  key={option.value || EMPTY}
                  type="button"
                  disabled={option.disabled}
                  onClick={() => {
                    onValueChange(option.value);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={cn(
                    "flex w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground disabled:opacity-50",
                    option.value === value && "bg-accent text-accent-foreground",
                  )}
                >
                  <span className="truncate">{option.label}</span>
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

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
