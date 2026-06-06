"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const STATUS_COLORS: Record<string, string> = {
  delivered: "#16a34a",
  delayed: "#f59e0b",
  in_transit: "#3b82f6",
  exception: "#ef4444",
  canceled: "#94a3b8",
};

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">{title}</h3>
      <div className="h-64 w-full">{children}</div>
    </div>
  );
}

export function VolumeOverTime({ data }: { data: { label: string; value: number }[] }) {
  return (
    <Panel title="Order Volume Over Time (by month)">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="value"
            name="orders"
            stroke="#4f46e5"
            strokeWidth={2}
            dot={{ r: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Panel>
  );
}

export function OnTimeVsDelayed({
  data,
}: {
  data: { carrier: string; delivered: number; delayed: number }[];
}) {
  return (
    <Panel title="Delivered vs Delayed by Carrier">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
          <XAxis dataKey="carrier" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="delivered" name="Delivered" fill="#16a34a" stackId="a" />
          <Bar dataKey="delayed" name="Delayed" fill="#f59e0b" stackId="a" />
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  );
}

export function StatusDonut({ data }: { data: { label: string; value: number }[] }) {
  return (
    <Panel title="Orders by Status">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius={45}
            outerRadius={80}
            paddingAngle={2}
          >
            {data.map((d) => (
              <Cell key={d.label} fill={STATUS_COLORS[d.label] ?? "#a78bfa"} />
            ))}
          </Pie>
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </Panel>
  );
}

export function VolumeByRegion({ data }: { data: { label: string; value: number }[] }) {
  return (
    <Panel title="Order Volume by Region">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="value" name="orders" fill="#4f46e5" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  );
}

/** Color a rate green (good) → amber → red (poor). */
function rateColor(pct: number): string {
  if (pct >= 90) return "#16a34a";
  if (pct >= 80) return "#65a30d";
  if (pct >= 70) return "#f59e0b";
  return "#ef4444";
}

export function OnTimeRateByCarrier({
  data,
}: {
  data: { carrier: string; rate: number; settled: number }[];
}) {
  // rate is 0..1; render as percent, sorted worst-first by the caller.
  const rows = data.map((d) => ({
    carrier: d.carrier,
    pct: Number((d.rate * 100).toFixed(1)),
    settled: d.settled,
  }));
  return (
    <Panel title="On-Time Rate by Carrier (worst first)">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={rows}
          margin={{ top: 8, right: 32, bottom: 0, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => `${v}%`}
          />
          <YAxis
            type="category"
            dataKey="carrier"
            tick={{ fontSize: 11 }}
            width={72}
          />
          <Tooltip
            formatter={(v: number, _n, p: any) => [
              `${v}% on-time (n=${p.payload.settled})`,
              "on-time rate",
            ]}
          />
          <Bar dataKey="pct" name="on-time rate" radius={[0, 4, 4, 0]}>
            {rows.map((r) => (
              <Cell key={r.carrier} fill={rateColor(r.pct)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  );
}
