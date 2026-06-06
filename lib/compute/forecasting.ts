import type { Order } from "../types";
import type { ForecastSpec } from "../query/spec";

/**
 * Forecasting tool (deterministic). Method: simple exponential smoothing with a
 * linear trend (Holt-style), described in the README.
 *
 * Why this method: we have at most ~12 monthly points per series. Heavier models
 * (ARIMA/Prophet) over-fit at this length and add dependencies. Exponential
 * smoothing tracks the recent level, and a small trend term lets the forecast
 * drift instead of going flat. It is fully deterministic and explainable.
 */

export interface ForecastPoint {
  month: string; // "YYYY-MM"
  value: number;
  type: "history" | "forecast";
}

export interface ForecastResult {
  dimension: ForecastSpec["dimension"];
  dimensionValue: string;
  metric: ForecastSpec["metric"];
  history: ForecastPoint[];
  forecast: ForecastPoint[];
  /** Series combining history + forecast for charting. */
  series: ForecastPoint[];
  methodology: string;
  inventoryRecommendation: string;
  /** Mean of historical values, for context. */
  historicalMonthlyAvg: number;
  /** Mean of the forecast horizon. */
  forecastMonthlyAvg: number;
  /** Number of historical months actually present (data sufficiency signal). */
  historyMonths: number;
  /** True when too few months to forecast meaningfully. */
  sparse: boolean;
  warning?: string;
}

const ALPHA = 0.4; // level smoothing
const BETA = 0.3; // trend smoothing

/** Build a dense monthly series (filling absent months with 0) across the data span. */
function monthlySeries(orders: Order[], metric: ForecastSpec["metric"]): ForecastPoint[] {
  if (orders.length === 0) return [];
  const byMonth = new Map<string, number>();
  for (const o of orders) {
    if (!o.orderDate) continue;
    const m = o.orderDate.slice(0, 7);
    const add = metric === "quantity" ? o.quantity : o.orderValueUsd;
    byMonth.set(m, (byMonth.get(m) ?? 0) + add);
  }
  const months = Array.from(byMonth.keys()).sort();
  if (months.length === 0) return [];

  // Fill the gap between first and last present month with zeros.
  const out: ForecastPoint[] = [];
  let [y, mo] = months[0].split("-").map(Number);
  const [ey, em] = months[months.length - 1].split("-").map(Number);
  while (y < ey || (y === ey && mo <= em)) {
    const key = `${y}-${String(mo).padStart(2, "0")}`;
    out.push({ month: key, value: byMonth.get(key) ?? 0, type: "history" });
    mo += 1;
    if (mo > 12) {
      mo = 1;
      y += 1;
    }
  }
  return out;
}

function nextMonth(month: string): string {
  let [y, m] = month.split("-").map(Number);
  m += 1;
  if (m > 12) {
    m = 1;
    y += 1;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function runForecast(
  orders: ReadonlyArray<Order>,
  spec: ForecastSpec,
): ForecastResult {
  const filtered = orders.filter((o) =>
    spec.dimension === "sku"
      ? o.sku.toLowerCase() === spec.dimensionValue.toLowerCase()
      : o.productCategory.toLowerCase() === spec.dimensionValue.toLowerCase(),
  );

  const history = monthlySeries(filtered as Order[], spec.metric);
  const historyMonths = history.length;
  const histVals = history.map((p) => p.value);
  const historicalMonthlyAvg =
    histVals.length === 0 ? 0 : histVals.reduce((a, b) => a + b, 0) / histVals.length;

  // Holt's linear exponential smoothing.
  const forecast: ForecastPoint[] = [];
  let warning: string | undefined;
  const sparse = historyMonths < 3;

  if (historyMonths === 0) {
    warning = `No historical orders found for ${spec.dimension} "${spec.dimensionValue}".`;
  } else if (sparse) {
    // Too little data: fall back to a flat mean forecast and warn.
    warning = `Only ${historyMonths} month(s) of history for "${spec.dimensionValue}" — forecast falls back to the historical average and is low-confidence.`;
    let month = history[history.length - 1].month;
    for (let i = 0; i < spec.forecastMonths; i++) {
      month = nextMonth(month);
      forecast.push({
        month,
        value: Math.max(0, Math.round(historicalMonthlyAvg * 100) / 100),
        type: "forecast",
      });
    }
  } else {
    let level = histVals[0];
    let trend = histVals[1] - histVals[0];
    for (let i = 1; i < histVals.length; i++) {
      const prevLevel = level;
      level = ALPHA * histVals[i] + (1 - ALPHA) * (level + trend);
      trend = BETA * (level - prevLevel) + (1 - BETA) * trend;
    }
    let month = history[history.length - 1].month;
    for (let h = 1; h <= spec.forecastMonths; h++) {
      month = nextMonth(month);
      const raw = level + h * trend;
      forecast.push({
        month,
        value: Math.max(0, Math.round(raw * 100) / 100),
        type: "forecast",
      });
    }
  }

  const forecastMonthlyAvg =
    forecast.length === 0
      ? 0
      : forecast.reduce((a, b) => a + b.value, 0) / forecast.length;

  // Inventory recommendation (simple, deterministic business rule).
  let inventoryRecommendation: string;
  const unit = spec.metric === "quantity" ? "units" : "USD";
  if (historyMonths === 0) {
    inventoryRecommendation =
      "No history — cannot recommend inventory. Collect more order data for this item.";
  } else {
    const deltaPct =
      historicalMonthlyAvg === 0
        ? 0
        : ((forecastMonthlyAvg - historicalMonthlyAvg) / historicalMonthlyAvg) * 100;
    const rounded = Math.round(forecastMonthlyAvg);
    if (deltaPct > 10) {
      inventoryRecommendation = `Demand trending UP (+${deltaPct.toFixed(0)}% vs history). Increase stock to ~${rounded} ${unit}/month to avoid stockouts.`;
    } else if (deltaPct < -10) {
      inventoryRecommendation = `Demand trending DOWN (${deltaPct.toFixed(0)}% vs history). Reduce reorder volume toward ~${rounded} ${unit}/month to limit excess inventory.`;
    } else {
      inventoryRecommendation = `Demand stable (~${deltaPct.toFixed(0)}% vs history). Maintain current stocking near ~${rounded} ${unit}/month.`;
    }
  }

  const methodology = sparse
    ? `Fallback: flat mean forecast. With fewer than 3 monthly data points, exponential smoothing is unreliable, so we project the historical monthly average (${historicalMonthlyAvg.toFixed(2)} ${unit}) forward ${spec.forecastMonths} month(s).`
    : `Holt's linear exponential smoothing (level α=${ALPHA}, trend β=${BETA}). We aggregate ${spec.metric === "quantity" ? "order quantity" : "order value (USD)"} by calendar month for the selected ${spec.dimension}, smooth the level and trend over ${historyMonths} months of history, then project ${spec.forecastMonths} month(s) ahead as level + h·trend (floored at 0).`;

  return {
    dimension: spec.dimension,
    dimensionValue: spec.dimensionValue,
    metric: spec.metric,
    history,
    forecast,
    series: [...history, ...forecast],
    methodology,
    inventoryRecommendation,
    historicalMonthlyAvg,
    forecastMonthlyAvg,
    historyMonths,
    sparse,
    warning,
  };
}
