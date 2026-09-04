import {
  Button as BasaltButton,
  buttonVariants as basaltButtonVariants,
} from "@nocoo/basalt/components/button";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva("", {
  variants: {
    variant: {
      default: "",
      secondary: "",
      destructive: "",
      outline: "",
      ghost: "",
      link: "",
    },
    size: {
      default: "",
      sm: "",
      lg: "",
      icon: "",
      xs: "!h-6 !gap-1 !rounded-md !px-2 !text-xs [&_svg]:!size-3",
      "icon-xs": "!size-6 !rounded-md [&_svg]:!size-3",
      "icon-sm": "!size-8",
      "icon-lg": "!size-10",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});

type BasaltSize = "default" | "sm" | "lg" | "icon";

type BasaltVariant = "default" | "destructive" | "ghost" | "link" | "outline" | "secondary";

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "size">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    // Map extended sizes to standard basalt sizes + custom utility classes
    let basaltSize: BasaltSize = "default";
    if (size === "sm" || size === "xs" || size === "icon-sm" || size === "icon-xs") {
      basaltSize = "sm";
    } else if (size === "lg" || size === "icon-lg") {
      basaltSize = "lg";
    } else if (size === "icon") {
      basaltSize = "icon";
    }

    const customClass = buttonVariants({ size });

    return (
      <BasaltButton
        ref={ref}
        variant={(variant ?? "default") as BasaltVariant}
        size={basaltSize}
        className={cn(customClass, className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, basaltButtonVariants, buttonVariants };
