"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import { faContent, faMessages } from "@/locales/domain-fa";
import { fa } from "@/lib/types";
export default function HostSalesChart({ chart }: { chart: { label: string; sales: number }[] }) {
  return (
                <ChartContainer
                  className="host-chart"
                  config={{ sales: { label: faContent.sales, color: "var(--chart-1)" } }}
                >
                  <BarChart data={chart} accessibilityLayer>
                    <CartesianGrid
                      vertical={false}
                      strokeDasharray="3 3"
                      stroke="var(--border)"
                    />
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      fontSize={13}
                      tick={{ fill: "var(--text-muted)" }}
                    />
                    <YAxis
                      tickFormatter={(v) => fa(v)}
                      width={65}
                      axisLine={false}
                      tickLine={false}
                      fontSize={13}
                      tick={{ fill: "var(--text-muted)" }}
                    />
                    <Tooltip
                      formatter={(v) => [faMessages.amountWithCurrency(String(fa(Number(v)))), faContent.sales]}
                      contentStyle={{
                        direction: "rtl",
                        borderRadius: 12,
                        fontFamily: "var(--font-app)",
                        fontSize: 14,
                        backgroundColor: "var(--popover)",
                        color: "var(--popover-foreground)",
                        borderColor: "var(--border)",
                      }}
                      labelStyle={{ color: "var(--text-muted)" }}
                      itemStyle={{ color: "var(--foreground)" }}
                    />
                    <Bar
                      dataKey="sales"
                      fill="var(--color-sales)"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={36}
                    />
                  </BarChart>
                </ChartContainer>
  );
}
