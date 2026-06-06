// Shared domain types for the logistics analytics dashboard.

/** Canonical order status values present in the dataset. */
export type OrderStatus =
  | "delivered"
  | "delayed"
  | "in_transit"
  | "exception"
  | "canceled";

/**
 * One order row. Mirrors the CSV columns but with parsed/typed fields.
 * `deliveryDate` is null for orders that have not been delivered yet (30 rows).
 */
export interface Order {
  clientId: string;
  orderId: string;
  orderDate: string; // ISO date "YYYY-MM-DD"
  deliveryDate: string | null; // ISO date or null when undelivered
  carrier: string;
  originCity: string;
  destinationCity: string;
  status: OrderStatus;
  sku: string;
  productCategory: string;
  quantity: number;
  unitPriceUsd: number;
  orderValueUsd: number;
  isPromo: boolean;
  promoDiscountPct: number;
  region: string;
  warehouse: string;
  // Derived: delivery time in days, null when not yet delivered.
  deliveryDays: number | null;
}

/** Top-level KPIs for the descriptive dashboard. */
export interface KpiSummary {
  totalOrders: number;
  deliveredOrders: number;
  delayedOrders: number;
  inTransitOrders: number;
  exceptionOrders: number;
  canceledOrders: number;
  /** delivered / (delivered + delayed), over delivered-date-present orders. 0..1 */
  onTimeRate: number;
  /** mean(deliveryDays) over orders with a non-null delivery date. */
  avgDeliveryDays: number;
  /** mean(orderValueUsd) over all orders. */
  avgOrderValueUsd: number;
  /** sum(orderValueUsd) over all orders. */
  totalRevenueUsd: number;
}
