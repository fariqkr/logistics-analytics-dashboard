"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Chart for a grouped query result. Chooses the chart type by dimension:
 * time dimensions (week/month) render as a line (a trend), everything else as
 * a bar (a comparison across categories).
 */
export function QueryResultChart({
  rows,
  metric,
  groupBy,
}: {
  rows: { group: string; value: number }[];
  metric: string;
  groupBy?: string | null;
}) {
  const isRate = metric === "delay_rate" || metric === "on_time_rate";
  const isTimeSeries = groupBy === "week" || groupBy === "month";
  const data = rows.map((r) => ({
    group: r.group,
    value: isRate ? Number((r.value * 100).toFixed(1)) : Number(r.value.toFixed(2)),
  }));
  const xAxis = (
    <XAxis
      dataKey="group"
      tick={{ fontSize: 10 }}
      interval={0}
      angle={data.length > 6 ? -25 : 0}
      textAnchor={data.length > 6 ? "end" : "middle"}
      height={data.length > 6 ? 50 : 24}
    />
  );
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {isTimeSeries ? (
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            {xAxis}
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => (isRate ? `${v}%` : v)} />
            <Line
              type="monotone"
              dataKey="value"
              name={metric}
              stroke="#4f46e5"
              strokeWidth={2}
              dot={{ r: 2 }}
            />
          </LineChart>
        ) : (
          <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            {xAxis}
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => (isRate ? `${v}%` : v)} />
            <Bar dataKey="value" name={metric} fill="#4f46e5" radius={[4, 4, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

/** History + forecast composed chart. */
export function ForecastChart({
  series,
}: {
  series: { month: string; value: number; type: "history" | "forecast" }[];
}) {
  // Split into two keys so history and forecast render as distinct lines. To
  // make them visually continuous we seed the forecast key at the LAST history
  // point (so the dashed line starts where the solid line ends) — rather than
  // bleeding history forward into the forecast months.
  const data = series.map((p, i) => {
    const isLastHistory =
      p.type === "history" && i < series.length - 1 && series[i + 1].type === "forecast";
    return {
      month: p.month,
      history: p.type === "history" ? p.value : null,
      forecast: p.type === "forecast" ? p.value : isLastHistory ? p.value : null,
    };
  });
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
          <XAxis dataKey="month" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={50} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="history"
            name="History"
            stroke="#4f46e5"
            strokeWidth={2}
            dot={{ r: 2 }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="forecast"
            name="Forecast"
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={{ r: 3 }}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
