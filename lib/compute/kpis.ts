import type { KpiSummary, Order } from "../types";

/**
 * KPI definitions (documented in README). All pure functions over an Order[]
 * so they are trivially unit-testable and deterministic.
 *
 *   - delivered/delayed/in_transit/exception/canceled orders = COUNT by status
 *   - onTimeRate = delivered / (delivered + delayed), computed ONLY over orders
 *       with a non-null delivery_date. "delayed" counts as not-on-time.
 *       in_transit / exception / canceled are excluded (outcome unknown / N/A).
 *   - avgDeliveryDays = mean(deliveryDays) over non-null delivery_date orders.
 *   - avgOrderValueUsd = mean(order_value_usd) over ALL orders.
 */

function countBy(orders: ReadonlyArray<Order>, status: string): number {
  return orders.reduce((n, o) => (o.status === status ? n + 1 : n), 0);
}

export function computeKpis(orders: ReadonlyArray<Order>): KpiSummary {
  const totalOrders = orders.length;
  const deliveredOrders = countBy(orders, "delivered");
  const delayedOrders = countBy(orders, "delayed");
  const inTransitOrders = countBy(orders, "in_transit");
  const exceptionOrders = countBy(orders, "exception");
  const canceledOrders = countBy(orders, "canceled");

  // On-time rate: only over orders that actually have a delivery date.
  const settled = orders.filter(
    (o) =>
      o.deliveryDate !== null &&
      (o.status === "delivered" || o.status === "delayed"),
  );
  const settledDelivered = settled.filter((o) => o.status === "delivered").length;
  const onTimeRate = settled.length === 0 ? 0 : settledDelivered / settled.length;

  // Avg delivery time: only over non-null delivery dates.
  const withDelivery = orders.filter((o) => o.deliveryDays !== null);
  const avgDeliveryDays =
    withDelivery.length === 0
      ? 0
      : withDelivery.reduce((s, o) => s + (o.deliveryDays as number), 0) /
        withDelivery.length;

  const totalRevenueUsd = orders.reduce((s, o) => s + o.orderValueUsd, 0);
  const avgOrderValueUsd = totalOrders === 0 ? 0 : totalRevenueUsd / totalOrders;

  return {
    totalOrders,
    deliveredOrders,
    delayedOrders,
    inTransitOrders,
    exceptionOrders,
    canceledOrders,
    onTimeRate,
    avgDeliveryDays,
    avgOrderValueUsd,
    totalRevenueUsd,
  };
}
