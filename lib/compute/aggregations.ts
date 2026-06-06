import type { Order } from "../types";
import type { Dimension, Metric, QuerySpec } from "../query/spec";

/**
 * Deterministic execution of a QuerySpec against an Order[]. This is layer (2)
 * data computation + (3) business logic. No AI, no SQL — just typed functions.
 */

export interface QueryResultRow {
  /** The group key (e.g. carrier name, "2025-03"); "all" for ungrouped. */
  group: string;
  /** The computed metric value. */
  value: number;
  /** How many source rows fell into this group (for context/explainability). */
  rowCount: number;
}

export interface QueryResult {
  metric: Metric;
  groupBy: Dimension | null;
  rows: QueryResultRow[];
  /** The raw orders that matched the filters (for the explainability table). */
  matchedRows: Order[];
  /** Total source rows matched after filtering. */
  matchedCount: number;
}

// ---- filtering -------------------------------------------------------------

function applyFilters(orders: ReadonlyArray<Order>, f: QuerySpec["filters"]): Order[] {
  return orders.filter((o) => {
    if (f.status && o.status !== f.status) return false;
    if (f.carrier && o.carrier.toLowerCase() !== f.carrier.toLowerCase()) return false;
    if (f.region && o.region.toLowerCase() !== f.region.toLowerCase()) return false;
    if (
      f.productCategory &&
      o.productCategory.toLowerCase() !== f.productCategory.toLowerCase()
    )
      return false;
    if (f.sku && o.sku.toLowerCase() !== f.sku.toLowerCase()) return false;
    if (f.warehouse && o.warehouse.toLowerCase() !== f.warehouse.toLowerCase())
      return false;
    if (f.isPromo !== undefined && o.isPromo !== f.isPromo) return false;
    if (f.dateFrom && o.orderDate < f.dateFrom) return false;
    if (f.dateTo && o.orderDate > f.dateTo) return false;
    return true;
  });
}

// ---- grouping --------------------------------------------------------------

/** ISO week label like "2025-W03" derived from an ISO date string. */
function isoWeek(dateIso: string): string {
  const d = new Date(dateIso + "T00:00:00Z");
  const day = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - day + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((d.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    );
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function groupKey(o: Order, dim: Dimension): string {
  switch (dim) {
    case "carrier":
      return o.carrier;
    case "region":
      return o.region;
    case "product_category":
      return o.productCategory;
    case "status":
      return o.status;
    case "warehouse":
      return o.warehouse;
    case "sku":
      return o.sku;
    case "week":
      return o.orderDate ? isoWeek(o.orderDate) : "unknown";
    case "month":
      return o.orderDate ? o.orderDate.slice(0, 7) : "unknown";
  }
}

// ---- metric computation over a bucket of orders ----------------------------

function metricValue(bucket: Order[], metric: Metric): number {
  switch (metric) {
    case "order_count":
      return bucket.length;
    case "delayed_count":
      return bucket.filter((o) => o.status === "delayed").length;
    case "delivered_count":
      return bucket.filter((o) => o.status === "delivered").length;
    case "delay_rate":
    case "on_time_rate": {
      // Only over settled orders (delivered or delayed) with a delivery date.
      const settled = bucket.filter(
        (o) =>
          o.deliveryDate !== null &&
          (o.status === "delivered" || o.status === "delayed"),
      );
      if (settled.length === 0) return 0;
      const delivered = settled.filter((o) => o.status === "delivered").length;
      const delayed = settled.length - delivered;
      return metric === "delay_rate"
        ? delayed / settled.length
        : delivered / settled.length;
    }
    case "avg_delivery_days": {
      const withDel = bucket.filter((o) => o.deliveryDays !== null);
      if (withDel.length === 0) return 0;
      return (
        withDel.reduce((s, o) => s + (o.deliveryDays as number), 0) / withDel.length
      );
    }
    case "total_order_value":
      return bucket.reduce((s, o) => s + o.orderValueUsd, 0);
    case "avg_order_value":
      return bucket.length === 0
        ? 0
        : bucket.reduce((s, o) => s + o.orderValueUsd, 0) / bucket.length;
    case "total_quantity":
      return bucket.reduce((s, o) => s + o.quantity, 0);
    case "avg_discount_pct": {
      // Average promo discount, over promo orders only (non-promo orders have a
      // 0% discount by definition and would otherwise drag the mean to ~0).
      const promo = bucket.filter((o) => o.isPromo);
      if (promo.length === 0) return 0;
      return promo.reduce((s, o) => s + o.promoDiscountPct, 0) / promo.length;
    }
  }
}

// ---- ordering helpers for time dimensions ----------------------------------

function chronoSortKey(group: string): string {
  // Both "2025-03" and "2025-W03" sort correctly as strings.
  return group;
}

// ---- main entrypoint -------------------------------------------------------

export function runQuery(
  orders: ReadonlyArray<Order>,
  spec: QuerySpec,
): QueryResult {
  const matched = applyFilters(orders, spec.filters);

  let rows: QueryResultRow[];

  if (!spec.groupBy) {
    rows = [
      {
        group: "all",
        value: metricValue(matched, spec.metric),
        rowCount: matched.length,
      },
    ];
  } else {
    const buckets = new Map<string, Order[]>();
    for (const o of matched) {
      const key = groupKey(o, spec.groupBy);
      const arr = buckets.get(key);
      if (arr) arr.push(o);
      else buckets.set(key, [o]);
    }
    rows = Array.from(buckets.entries()).map(([group, bucket]) => ({
      group,
      value: metricValue(bucket, spec.metric),
      rowCount: bucket.length,
    }));

    // Time dimensions: sort chronologically by default for sensible charts.
    if (spec.groupBy === "week" || spec.groupBy === "month") {
      rows.sort((a, b) => chronoSortKey(a.group).localeCompare(chronoSortKey(b.group)));
      if (spec.orderBy?.direction === "desc") rows.reverse();
    } else {
      const dir = spec.orderBy?.direction ?? "desc";
      rows.sort((a, b) => (dir === "asc" ? a.value - b.value : b.value - a.value));
    }
  }

  if (spec.limit) rows = rows.slice(0, spec.limit);

  return {
    metric: spec.metric,
    groupBy: spec.groupBy ?? null,
    rows,
    matchedRows: matched,
    matchedCount: matched.length,
  };
}
