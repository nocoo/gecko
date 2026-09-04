import {
  Button as BasaltButton,
  buttonVariants as basaltButtonVariants,
} from "@nocoo/basalt/components/button";
import * as React from "react";
import { cn } from "@/lib/utils";

export type ExtendedButtonSize =
  | "default"
  | "sm"
  | "lg"
  | "icon"
  | "xs"
  | "icon-xs"
  | "icon-sm"
  | "icon-lg";

export type ButtonVariant = "default" | "destructive" | "ghost" | "link" | "outline" | "secondary";

export interface ButtonVariantProps {
  variant?: ButtonVariant | null;
  size?: ExtendedButtonSize | null;
  className?: string;
}

const EXTENDED_SIZE_CLASSES: Record<string, string> = {
  xs: "h-6 gap-1 rounded-md px-2 text-xs [&_svg]:size-3",
  "icon-xs": "size-6 rounded-md [&_svg]:size-3",
  "icon-sm": "size-8",
  "icon-lg": "size-10",
};

export function buttonVariants({
  variant = "default",
  size = "default",
  className,
}: ButtonVariantProps = {}): string {
  const chosenVariant = variant ?? "default";
  const chosenSize = size ?? "default";

  let basaltSize: "default" | "sm" | "lg" | "icon" = "default";
  if (
    chosenSize === "sm" ||
    chosenSize === "xs" ||
    chosenSize === "icon-sm" ||
    chosenSize === "icon-xs"
  ) {
    basaltSize = "sm";
  } else if (chosenSize === "lg" || chosenSize === "icon-lg") {
    basaltSize = "lg";
  } else if (chosenSize === "icon") {
    basaltSize = "icon";
  }

  const base = basaltButtonVariants({
    variant: chosenVariant,
    size: basaltSize,
  });

  const extraClass = EXTENDED_SIZE_CLASSES[chosenSize];
  return cn(base, extraClass, className);
}

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "size">,
    ButtonVariantProps {
  asChild?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    let basaltSize: "default" | "sm" | "lg" | "icon" = "default";
    const chosenSize = size ?? "default";
    if (
      chosenSize === "sm" ||
      chosenSize === "xs" ||
      chosenSize === "icon-sm" ||
      chosenSize === "icon-xs"
    ) {
      basaltSize = "sm";
    } else if (chosenSize === "lg" || chosenSize === "icon-lg") {
      basaltSize = "lg";
    } else if (chosenSize === "icon") {
      basaltSize = "icon";
    }

    const extraClass = EXTENDED_SIZE_CLASSES[chosenSize];

    return (
      <BasaltButton
        ref={ref}
        variant={(variant ?? "default") as ButtonVariant}
        size={basaltSize}
        className={cn(extraClass, className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, basaltButtonVariants };
