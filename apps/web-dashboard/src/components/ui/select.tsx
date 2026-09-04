import { ChevronDown } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        data-slot="select"
        className={cn(
          "flex h-9 w-full appearance-none rounded-lg border border-basalt-border bg-basalt-secondary px-3 pr-9 py-1.5 text-sm text-basalt-foreground transition-colors hover:border-basalt-border/80 focus-visible:outline-hidden focus-visible:border-basalt-ring focus-visible:ring-1 focus-visible:ring-basalt-ring disabled:cursor-not-allowed disabled:border-transparent disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-basalt-muted-foreground"
        strokeWidth={1.5}
      />
    </div>
  );
}

export { Select };
