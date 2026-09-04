"use client";

import { LoadingScreen as BasaltLoadingScreen } from "@nocoo/basalt/components/loading-screen";
import Image from "next/image";

/**
 * Full-screen loading overlay with basalt loading screen and gecko logo mark.
 */
export default function LoadingScreen() {
  return (
    <BasaltLoadingScreen
      label="Loading Gecko"
      mark={
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-basalt-secondary ring-1 ring-basalt-border p-2.5">
          <Image
            src="/logo-24.png"
            alt="Gecko"
            width={24}
            height={24}
            unoptimized
            className="h-full w-full object-contain"
          />
        </div>
      }
    />
  );
}
