"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { AnimatedRegion } from "@/components/ui/animated-region";
import { useSelectionIndicator } from "@/hooks/use-selection-indicator";

const ActiveTabContext = React.createContext<string | undefined>(undefined);

function Tabs({ className, orientation = "horizontal", value, defaultValue,
  onValueChange, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue);
  const active = value ?? uncontrolledValue;
  return (
    <ActiveTabContext.Provider value={active}>
      <TabsPrimitive.Root data-motion-group data-slot="tabs" data-orientation={orientation}
        orientation={orientation} value={active}
        onValueChange={(next) => {
          if (value === undefined) setUncontrolledValue(next);
          onValueChange?.(next);
        }}
        className={cn("group/tabs flex gap-2 data-[orientation=horizontal]:flex-col", className)}
        {...props} />
    </ActiveTabContext.Provider>
  );
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-[orientation=horizontal]/tabs:h-9 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none",
  { variants: { variant: { default: "bg-muted", line: "gap-1 bg-transparent" } },
    defaultVariants: { variant: "default" } },
);

function TabsList({ className, variant = "default", children, ref: forwardedRef, ...props }:
  React.ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>) {
  const indicatorRef = useSelectionIndicator<HTMLDivElement>('[role="tab"][data-state="active"]');
  return (
    <TabsPrimitive.List data-slot="tabs-list" data-variant={variant}
      className={cn(tabsListVariants({ variant }), "selection-track", className)}
      ref={(element) => {
        indicatorRef.current = element;
        if (typeof forwardedRef === "function") forwardedRef(element);
        else if (forwardedRef) forwardedRef.current = element;
      }} {...props}>
      <span className="selection-indicator" aria-hidden="true" />
      {children}
    </TabsPrimitive.List>
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )} {...props} />
  );
}

function TabsContent({ className, value, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  const active = React.useContext(ActiveTabContext) === value;
  return (
    <TabsPrimitive.Content data-motion-group forceMount value={value} hidden={!active} inert={!active}
      tabIndex={active ? 0 : -1} data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)} {...props} />
  );
}

function TabsPanels(props: React.ComponentProps<"div">) {
  const active = React.useContext(ActiveTabContext);
  return <AnimatedRegion {...props} transitionKey={active} contentClassName="tab-panels" />;
}

export { Tabs, TabsList, TabsTrigger, TabsContent, TabsPanels, tabsListVariants };
