"use client";

import { DialogContent as BasaltDialogContent } from "@nocoo/basalt/components/dialog";
import { type ComponentProps, useRef } from "react";

export {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "@nocoo/basalt/components/dialog";

export function DialogContent({
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: ComponentProps<typeof BasaltDialogContent>) {
  const opener = useRef<HTMLElement | null>(null);

  return (
    <BasaltDialogContent
      {...props}
      onOpenAutoFocus={(event) => {
        opener.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        onOpenAutoFocus?.(event);
      }}
      onCloseAutoFocus={(event) => {
        onCloseAutoFocus?.(event);
        if (event.defaultPrevented) return;
        const target = opener.current?.isConnected
          ? opener.current
          : document.getElementById("main-content");
        if (target) {
          event.preventDefault();
          target.focus();
        }
      }}
    />
  );
}
