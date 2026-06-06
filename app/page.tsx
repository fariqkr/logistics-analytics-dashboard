import Link from "next/link";
import { getOrders } from "@/lib/data";
import { computeKpis } from "@/lib/compute/kpis";
import { runQuery } from "@/lib/compute/aggregations";
import KPICards from "@/components/dashboard/KPICards";
import {
  OnTimeRateByCarrier,
  OnTimeVsDelayed,
  StatusDonut,
  VolumeByRegion,
  VolumeOverTime,
} from "@/components/dashboard/Charts";

// Server component: computes everything from the deterministic layer directly.
export default function DashboardPage() {
  const orders = getOrders();
  const kpis = computeKpis(orders);

  const volumeByMonth = runQuery(orders, {
    tool: "query",
    metric: "order_count",
    filters: {},
    groupBy: "month",
  }).rows.map((r) => ({ label: r.group, value: r.value }));

  const delivered = runQuery(orders, {
    tool: "query",
    metric: "delivered_count",
    filters: {},
    groupBy: "carrier",
  }).rows;
  const delayed = runQuery(orders, {
    tool: "query",
    metric: "delayed_count",
    filters: {},
    groupBy: "carrier",
  }).rows;
  const delayedMap = new Map(delayed.map((r) => [r.group, r.value]));
  const onTimeVsDelayed = delivered
    .map((r) => ({
      carrier: r.group,
      delivered: r.value,
      delayed: delayedMap.get(r.group) ?? 0,
    }))
    .sort((a, b) => b.delivered + b.delayed - (a.delivered + a.delayed));

  const statusBreakdown = runQuery(orders, {
    tool: "query",
    metric: "order_count",
    filters: {},
    groupBy: "status",
  }).rows.map((r) => ({ label: r.group, value: r.value }));

  const volumeByRegion = runQuery(orders, {
    tool: "query",
    metric: "order_count",
    filters: {},
    groupBy: "region",
  }).rows.map((r) => ({ label: r.group, value: r.value }));

  // On-time rate by carrier (settled = delivered + delayed), worst first.
  const onTimeRate = runQuery(orders, {
    tool: "query",
    metric: "on_time_rate",
    filters: {},
    groupBy: "carrier",
  }).rows;
  const onTimeRateByCarrier = onTimeRate
    .map((r) => ({
      carrier: r.group,
      rate: r.value,
      settled:
        (delivered.find((d) => d.group === r.group)?.value ?? 0) +
        (delayedMap.get(r.group) ?? 0),
    }))
    .sort((a, b) => a.rate - b.rate);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold">Descriptive Dashboard</h1>
          <p className="text-sm text-slate-500">
            400 orders · 2025-01-01 → 2025-12-30 · all figures computed
            deterministically from the source CSV.
          </p>
        </div>
        <Link
          href="/chat"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Ask a question →
        </Link>
      </div>

      <KPICards k={kpis} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <VolumeOverTime data={volumeByMonth} />
        <OnTimeVsDelayed data={onTimeVsDelayed} />
        <StatusDonut data={statusBreakdown} />
        <VolumeByRegion data={volumeByRegion} />
      </div>

      {/* Performance lens: normalizes carrier counts into the on-time KPI. */}
      <OnTimeRateByCarrier data={onTimeRateByCarrier} />

      <p className="text-xs text-slate-400">
        On-time rate = delivered ÷ (delivered + delayed), counted only over orders
        with a recorded delivery date. Avg delivery time averages (delivery_date −
        order_date) over delivered orders only; 30 undelivered orders are excluded.
      </p>
    </div>
  );
}
