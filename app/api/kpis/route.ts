import { NextResponse } from "next/server";
import { getOrders } from "@/lib/data";
import { computeKpis } from "@/lib/compute/kpis";
import { runQuery } from "@/lib/compute/aggregations";

/**
 * Descriptive dashboard data. Pure computation — no AI involved here.
 * Returns KPI cards + the series needed for the two charts.
 */
export const dynamic = "force-static";

export function GET() {
  const orders = getOrders();
  const kpis = computeKpis(orders);

  // Chart 1: order volume over time (by month).
  const volumeByMonth = runQuery(orders, {
    tool: "query",
    metric: "order_count",
    filters: {},
    groupBy: "month",
  }).rows.map((r) => ({ label: r.group, value: r.value }));

  // Chart 2: on-time vs delayed by carrier (delivered vs delayed counts).
  const deliveredByCarrier = runQuery(orders, {
    tool: "query",
    metric: "delivered_count",
    filters: {},
    groupBy: "carrier",
  }).rows;
  const delayedByCarrier = runQuery(orders, {
    tool: "query",
    metric: "delayed_count",
    filters: {},
    groupBy: "carrier",
  }).rows;
  const delayedMap = new Map(delayedByCarrier.map((r) => [r.group, r.value]));
  const onTimeVsDelayed = deliveredByCarrier
    .map((r) => ({
      carrier: r.group,
      delivered: r.value,
      delayed: delayedMap.get(r.group) ?? 0,
    }))
    .sort((a, b) => b.delivered + b.delayed - (a.delivered + a.delayed));

  // Chart 3: status breakdown (for a donut/pie).
  const statusBreakdown = runQuery(orders, {
    tool: "query",
    metric: "order_count",
    filters: {},
    groupBy: "status",
  }).rows.map((r) => ({ label: r.group, value: r.value }));

  // Chart 4: order volume by region.
  const volumeByRegion = runQuery(orders, {
    tool: "query",
    metric: "order_count",
    filters: {},
    groupBy: "region",
  }).rows.map((r) => ({ label: r.group, value: r.value }));

  return NextResponse.json({
    kpis,
    charts: { volumeByMonth, onTimeVsDelayed, statusBreakdown, volumeByRegion },
  });
}
