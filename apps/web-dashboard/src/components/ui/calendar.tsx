"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, type DayPickerProps, getDefaultClassNames } from "react-day-picker";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  components,
  ...props
}: DayPickerProps) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("text-sm", className)}
      classNames={{
        root: cn(defaultClassNames.root, "w-fit"),
        months: cn(defaultClassNames.months, "relative flex flex-col gap-4 sm:flex-row"),
        month: cn(defaultClassNames.month, "flex flex-col gap-4"),
        month_caption: cn(
          defaultClassNames.month_caption,
          "flex h-7 items-center justify-center px-8",
        ),
        caption_label: cn(defaultClassNames.caption_label, "text-sm font-medium"),
        nav: cn(
          defaultClassNames.nav,
          "absolute inset-x-0 top-0 flex items-center justify-between",
        ),
        button_previous: cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "p-0 opacity-70 hover:opacity-100",
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "p-0 opacity-70 hover:opacity-100",
        ),
        month_grid: cn(defaultClassNames.month_grid, "w-full border-collapse"),
        weekdays: cn(defaultClassNames.weekdays, "flex gap-0.5"),
        weekday: cn(
          defaultClassNames.weekday,
          "w-9 sm:w-13 rounded-md text-[0.7rem] font-normal text-basalt-muted-foreground",
        ),
        week: cn(defaultClassNames.week, "mt-0.5 flex w-full gap-0.5"),
        day: cn(
          defaultClassNames.day,
          "relative size-9 sm:size-13 p-0 text-center text-sm",
          "[&:has([aria-selected])]:rounded-md",
        ),
        day_button: cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "relative size-9 sm:size-13 p-0 font-normal aria-selected:opacity-100",
        ),
        range_start: cn(defaultClassNames.range_start, "rounded-l-md bg-basalt-accent"),
        range_end: cn(defaultClassNames.range_end, "rounded-r-md bg-basalt-accent"),
        range_middle: cn(
          defaultClassNames.range_middle,
          "rounded-none aria-selected:bg-basalt-accent aria-selected:text-basalt-accent-foreground",
        ),
        selected: cn(
          defaultClassNames.selected,
          "[&>button]:bg-basalt-primary [&>button]:text-basalt-primary-foreground [&>button]:hover:bg-basalt-primary [&>button]:hover:text-basalt-primary-foreground",
        ),
        today: cn(
          defaultClassNames.today,
          "[&>button]:bg-basalt-accent [&>button]:text-basalt-accent-foreground",
        ),
        outside: cn(
          defaultClassNames.outside,
          "text-basalt-muted-foreground/50 aria-selected:text-basalt-muted-foreground",
        ),
        disabled: cn(defaultClassNames.disabled, "text-basalt-muted-foreground/40 opacity-50"),
        hidden: cn(defaultClassNames.hidden, "invisible"),
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClassName, ...chevronProps }) => {
          const Icon = orientation === "left" ? ChevronLeft : ChevronRight;
          return <Icon className={cn("size-4", chevronClassName)} {...chevronProps} />;
        },
        ...components,
      }}
      {...props}
    />
  );
}

export { Calendar };
