import * as React from "react"
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}) {
  return (
    (<DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "relative flex flex-col sm:flex-row gap-4",
        month: "space-y-4",
        month_caption: "flex justify-center pt-1 relative items-center",
        caption_label: "flex items-center gap-1 text-sm font-medium",
        // The dropdown caption layout renders a native <select> plus a styled
        // label; overlay the (invisible) select so only the label shows.
        dropdowns: "flex items-center justify-center gap-1.5",
        dropdown_root: "relative",
        dropdown: "absolute inset-0 opacity-0 cursor-pointer",
        nav: "absolute inset-x-0 top-0 z-10 flex items-center justify-between",
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
        ),
        month_grid: "w-full border-collapse space-y-1",
        weekdays: "flex",
        weekday:
          "text-muted-foreground rounded-md w-8 font-normal text-[0.8rem]",
        week: "flex w-full mt-2",
        // In v9 the selection state lives on the day cell itself (data-selected /
        // aria-selected and the range_* classes land on the td, not a descendant).
        day: cn(
          "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 data-[selected]:bg-accent [&.day-outside]:data-[selected]:bg-accent/50 [&.day-range-end]:rounded-r-md",
          props.mode === "range"
            ? "[&.day-range-start]:rounded-l-md [&.day-range-end]:rounded-r-md first:data-[selected]:rounded-l-md last:data-[selected]:rounded-r-md"
            : "data-[selected]:rounded-md"
        ),
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-8 w-8 p-0 font-normal"
        ),
        range_start: "day-range-start",
        range_end: "day-range-end",
        selected:
          "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground [&>button]:focus:bg-primary [&>button]:focus:text-primary-foreground",
        today: "[&>button]:bg-accent [&>button]:text-accent-foreground",
        outside:
          "day-outside text-muted-foreground aria-selected:bg-accent/50 aria-selected:text-muted-foreground",
        disabled: "text-muted-foreground opacity-50",
        // [&[data-selected]>button] outranks `selected`'s [&>button] rules in
        // specificity, so middle-of-range buttons show accent, not primary.
        range_middle:
          "[&[data-selected]>button]:bg-accent [&[data-selected]>button]:text-accent-foreground",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ className, orientation, ...chevronProps }) => {
          // v9 also renders "down"/"up" chevrons (e.g. captionLayout="dropdown").
          const Icon =
            { left: ChevronLeft, right: ChevronRight, up: ChevronUp, down: ChevronDown }[orientation] ?? ChevronRight
          return <Icon className={cn("h-4 w-4", className)} {...chevronProps} />
        },
      }}
      {...props} />)
  );
}
Calendar.displayName = "Calendar"

export { Calendar }
