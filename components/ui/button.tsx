import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex min-w-0 max-w-full items-center justify-center gap-(--control-gap) rounded-(--radius-control) text-center text-sm font-medium whitespace-normal break-words transition-[background-color,color,border-color,box-shadow,opacity,transform] duration-200 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        outline:
          "border border-button-border bg-secondary text-secondary-foreground shadow-xs hover:bg-primary hover:text-primary-foreground hover:border-primary",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary-text underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-(--control-height) px-(--control-padding-inline) py-2",
        xs: "min-h-(--control-height) gap-1 px-3 py-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "min-h-(--control-height) gap-1.5 px-4 py-2",
        lg: "min-h-(--control-height) px-6 py-2",
        icon: "size-(--control-height) shrink-0 p-0",
        "icon-xs": "size-(--control-height) shrink-0 p-0 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-(--control-height) shrink-0 p-0",
        "icon-lg": "size-(--control-height) shrink-0 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
