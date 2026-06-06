import type { KpiSummary } from "@/lib/types";

function Card({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

export default function KPICards({ k }: { k: KpiSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      <Card label="Total Orders" value={String(k.totalOrders)} />
      <Card label="Delivered" value={String(k.deliveredOrders)} />
      <Card label="Delayed" value={String(k.delayedOrders)} />
      <Card
        label="On-Time Rate"
        value={`${(k.onTimeRate * 100).toFixed(1)}%`}
        sub="delivered ÷ (delivered+delayed)"
      />
      <Card
        label="Avg Delivery"
        value={`${k.avgDeliveryDays.toFixed(1)}d`}
        sub="delivered orders only"
      />
      <Card label="Avg Order Value" value={`$${k.avgOrderValueUsd.toFixed(2)}`} />
    </div>
  );
}
