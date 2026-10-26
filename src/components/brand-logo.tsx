"use client";

import Image from "next/image";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

export function BrandLogo({
  className,
  markOnly = false,
}: {
  className?: string;
  markOnly?: boolean;
}) {
  const { mode } = useTheme();

  if (markOnly) {
    return (
      <Image
        src="/aluinter-mark.png"
        alt="Aluinter"
        width={32}
        height={32}
        className={cn("h-8 w-8 object-contain", className)}
        priority
      />
    );
  }

  const src =
    mode === "light" ? "/aluinter-logo-light.png" : "/aluinter-logo-dark.png";

  return (
    <Image
      src={src}
      alt="Aluinter"
      width={180}
      height={34}
      className={cn("h-8 w-auto object-contain", className)}
      priority
    />
  );
}
