import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import type { Order, OrderStatus } from "./types";

/**
 * Data layer: loads the read-only CSV into an in-memory array exactly once
 * (module-level cache). All computation runs against this array. We never
 * mutate it — callers receive the shared frozen reference.
 *
 * Design note: an in-memory array is the right "store" here. 400 rows fit
 * trivially in memory, full scans are sub-millisecond, and it keeps the
 * deterministic compute layer free of any DB/SQL — which the spec requires
 * (no raw AI-generated SQL execution).
 */

const CSV_PATH = path.join(process.cwd(), "data", "mock_logistics_data.csv");

let cache: ReadonlyArray<Order> | null = null;

function diffDays(fromIso: string, toIso: string): number {
  const from = new Date(fromIso + "T00:00:00Z").getTime();
  const to = new Date(toIso + "T00:00:00Z").getTime();
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

function parseRow(r: Record<string, string>): Order {
  const orderDate = r.order_date?.trim() ?? "";
  const rawDelivery = r.delivery_date?.trim() ?? "";
  const deliveryDate = rawDelivery === "" ? null : rawDelivery;

  return {
    clientId: r.client_id?.trim() ?? "",
    orderId: r.order_id?.trim() ?? "",
    orderDate,
    deliveryDate,
    carrier: r.carrier?.trim() ?? "",
    originCity: r.origin_city?.trim() ?? "",
    destinationCity: r.destination_city?.trim() ?? "",
    status: (r.status?.trim() ?? "") as OrderStatus,
    sku: r.sku?.trim() ?? "",
    productCategory: r.product_category?.trim() ?? "",
    quantity: Number(r.quantity ?? 0),
    unitPriceUsd: Number(r.unit_price_usd ?? 0),
    orderValueUsd: Number(r.order_value_usd ?? 0),
    isPromo: r.is_promo?.trim() === "1",
    promoDiscountPct: Number(r.promo_discount_pct ?? 0),
    region: r.region?.trim() ?? "",
    warehouse: r.warehouse?.trim() ?? "",
    deliveryDays:
      deliveryDate && orderDate ? diffDays(orderDate, deliveryDate) : null,
  };
}

/** Parse raw CSV text into typed Orders. Exposed for unit tests. */
export function parseCsv(text: string): Order[] {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  return parsed.data.map(parseRow);
}

/** Load (and memoize) all orders from the bundled CSV. */
export function getOrders(): ReadonlyArray<Order> {
  if (cache) return cache;
  const text = fs.readFileSync(CSV_PATH, "utf8");
  cache = Object.freeze(parseCsv(text));
  return cache;
}
