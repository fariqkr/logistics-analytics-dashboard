import type { QueryResult } from "./compute/aggregations";
import type { Metric, QuerySpec } from "./query/spec";

/**
 * Deterministic answer formatting. The natural-language sentence the user reads
 * is generated HERE from the computed numbers — not by the AI — so the prose can
 * never disagree with the data.
 */

const RATE_METRICS: Metric[] = ["delay_rate", "on_time_rate"];
const MONEY_METRICS: Metric[] = ["total_order_value", "avg_order_value"];

export function formatMetricValue(metric: Metric, value: number): string {
  if (RATE_METRICS.includes(metric)) return `${(value * 100).toFixed(1)}%`;
  // promo_discount_pct is already stored as a percentage number (e.g. 10 = 10%).
  if (metric === "avg_discount_pct") return `${value.toFixed(1)}%`;
  if (MONEY_METRICS.includes(metric)) return `$${value.toFixed(2)}`;
  if (metric === "avg_delivery_days") return `${value.toFixed(2)} days`;
  // counts / quantities
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

const METRIC_LABEL: Record<Metric, string> = {
  order_count: "order count",
  delayed_count: "delayed orders",
  delivered_count: "delivered orders",
  delay_rate: "delay rate",
  on_time_rate: "on-time rate",
  avg_delivery_days: "average delivery time",
  total_order_value: "total order value",
  avg_order_value: "average order value",
  total_quantity: "total quantity",
  avg_discount_pct: "average promo discount",
};

const DIM_LABEL: Record<string, string> = {
  carrier: "carrier",
  region: "region",
  product_category: "product category",
  status: "status",
  warehouse: "warehouse",
  sku: "SKU",
  week: "week",
  month: "month",
};

const DIM_LABEL_PLURAL: Record<string, string> = {
  carrier: "carriers",
  region: "regions",
  product_category: "product categories",
  status: "statuses",
  warehouse: "warehouses",
  sku: "SKUs",
  week: "weeks",
  month: "months",
};

export function metricLabel(metric: Metric): string {
  return METRIC_LABEL[metric];
}

/** Build a one/two-sentence answer from the computed result. */
export function buildAnswer(spec: QuerySpec, result: QueryResult): string {
  const label = METRIC_LABEL[spec.metric];

  if (!result.groupBy) {
    const v = formatMetricValue(spec.metric, result.rows[0]?.value ?? 0);
    return `The ${label} is ${v} (over ${result.matchedCount} matching order${result.matchedCount === 1 ? "" : "s"}).`;
  }

  const dim = DIM_LABEL[result.groupBy] ?? result.groupBy;
  if (result.rows.length === 0) {
    return `No orders matched the filters, so there is no ${label} to report by ${dim}.`;
  }

  const top = result.rows[0];
  const topV = formatMetricValue(spec.metric, top.value);

  // For time series, describe the span rather than a "winner".
  if (result.groupBy === "week" || result.groupBy === "month") {
    return `${label[0].toUpperCase()}${label.slice(1)} by ${dim} across ${result.rows.length} period${result.rows.length === 1 ? "" : "s"} (${result.matchedCount} matching orders). See the chart and table below.`;
  }

  const isLowestFirst = spec.orderBy?.direction === "asc";
  const superlative = isLowestFirst ? "lowest" : "highest";
  const head = `${top.group} has the ${superlative} ${label} at ${topV} (n=${top.rowCount}).`;
  // Only mention a "breakdown" when there's actually more than one group to show.
  if (result.rows.length === 1) return head;
  const dimPlural = DIM_LABEL_PLURAL[result.groupBy] ?? `${dim}s`;
  return `${head} Full breakdown across ${result.rows.length} ${dimPlural} below.`;
}

/** Human-readable description of the filters that were applied. */
export function describeFilters(filters: QuerySpec["filters"]): string[] {
  const out: string[] = [];
  if (filters.status) out.push(`status = ${filters.status}`);
  if (filters.carrier) out.push(`carrier = ${filters.carrier}`);
  if (filters.region) out.push(`region = ${filters.region}`);
  if (filters.productCategory) out.push(`category = ${filters.productCategory}`);
  if (filters.sku) out.push(`sku = ${filters.sku}`);
  if (filters.warehouse) out.push(`warehouse = ${filters.warehouse}`);
  if (filters.isPromo !== undefined) out.push(`promo = ${filters.isPromo ? "yes" : "no"}`);
  if (filters.dateFrom) out.push(`order_date ≥ ${filters.dateFrom}`);
  if (filters.dateTo) out.push(`order_date ≤ ${filters.dateTo}`);
  if (out.length === 0) out.push("none (all 400 orders)");
  return out;
}
