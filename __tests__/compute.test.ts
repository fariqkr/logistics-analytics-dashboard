import { describe, it, expect } from "vitest";
import { getOrders } from "../lib/data";
import { computeKpis } from "../lib/compute/kpis";
import { runQuery } from "../lib/compute/aggregations";
import { runForecast } from "../lib/compute/forecasting";
import type { Order } from "../lib/types";

const orders = getOrders();

describe("data layer", () => {
  it("loads 400 rows with expected columns", () => {
    expect(orders.length).toBe(400);
    const o = orders[0];
    expect(o.orderId).toBeTruthy();
    expect(o.sku).toBeTruthy();
  });

  it("parses 30 null delivery dates", () => {
    expect(orders.filter((o) => o.deliveryDate === null).length).toBe(30);
    expect(orders.filter((o) => o.deliveryDays === null).length).toBe(30);
  });

  it("never produces negative delivery times", () => {
    const neg = orders.filter((o) => o.deliveryDays !== null && (o.deliveryDays as number) < 0);
    expect(neg.length).toBe(0);
  });
});

describe("KPIs (golden values from the dataset)", () => {
  const k = computeKpis(orders);

  it("matches known status counts", () => {
    expect(k.totalOrders).toBe(400);
    expect(k.deliveredOrders).toBe(304);
    expect(k.delayedOrders).toBe(55);
    expect(k.inTransitOrders).toBe(27);
    expect(k.exceptionOrders).toBe(11);
    expect(k.canceledOrders).toBe(3);
  });

  it("on-time rate = delivered / (delivered + delayed) over delivered+delayed with delivery dates", () => {
    // All delivered (304) and delayed (55) rows have delivery dates in this set;
    // verify the denominator the function actually used.
    const settled = orders.filter(
      (o) => o.deliveryDate !== null && (o.status === "delivered" || o.status === "delayed"),
    );
    const expected = settled.filter((o) => o.status === "delivered").length / settled.length;
    expect(k.onTimeRate).toBeCloseTo(expected, 10);
    // Sanity: between 0 and 1, and clearly majority on-time.
    expect(k.onTimeRate).toBeGreaterThan(0.8);
    expect(k.onTimeRate).toBeLessThanOrEqual(1);
  });

  it("avg delivery days computed only over non-null delivery dates", () => {
    const withDel = orders.filter((o) => o.deliveryDays !== null);
    const manual =
      withDel.reduce((s, o) => s + (o.deliveryDays as number), 0) / withDel.length;
    expect(k.avgDeliveryDays).toBeCloseTo(manual, 10);
  });

  it("avg order value over all rows", () => {
    const manual = orders.reduce((s, o) => s + o.orderValueUsd, 0) / orders.length;
    expect(k.avgOrderValueUsd).toBeCloseTo(manual, 6);
  });
});

describe("query engine", () => {
  it("ungrouped order_count respects status filter", () => {
    const r = runQuery(orders, {
      tool: "query",
      metric: "order_count",
      filters: { status: "delayed" },
    });
    expect(r.rows[0].value).toBe(55);
    expect(r.matchedCount).toBe(55);
  });

  it("group by carrier sums to total order count", () => {
    const r = runQuery(orders, {
      tool: "query",
      metric: "order_count",
      filters: {},
      groupBy: "carrier",
    });
    const total = r.rows.reduce((s, row) => s + row.value, 0);
    expect(total).toBe(400);
    expect(r.rows.length).toBe(9); // 9 carriers
  });

  it("delay_rate by carrier is between 0 and 1 and sorted desc", () => {
    const r = runQuery(orders, {
      tool: "query",
      metric: "delay_rate",
      filters: {},
      groupBy: "carrier",
      orderBy: { direction: "desc" },
    });
    for (const row of r.rows) {
      expect(row.value).toBeGreaterThanOrEqual(0);
      expect(row.value).toBeLessThanOrEqual(1);
    }
    for (let i = 1; i < r.rows.length; i++) {
      expect(r.rows[i - 1].value).toBeGreaterThanOrEqual(r.rows[i].value);
    }
  });

  it("group by month sorts chronologically", () => {
    const r = runQuery(orders, {
      tool: "query",
      metric: "order_count",
      filters: {},
      groupBy: "month",
    });
    const labels = r.rows.map((x) => x.group);
    const sorted = [...labels].sort();
    expect(labels).toEqual(sorted);
    const total = r.rows.reduce((s, row) => s + row.value, 0);
    expect(total).toBe(400);
  });

  it("date range filter narrows results", () => {
    const r = runQuery(orders, {
      tool: "query",
      metric: "order_count",
      filters: { dateFrom: "2025-01-01", dateTo: "2025-01-31" },
    });
    const manual = orders.filter(
      (o) => o.orderDate >= "2025-01-01" && o.orderDate <= "2025-01-31",
    ).length;
    expect(r.rows[0].value).toBe(manual);
  });

  it("total_order_value matches manual sum", () => {
    const r = runQuery(orders, {
      tool: "query",
      metric: "total_order_value",
      filters: {},
    });
    const manual = orders.reduce((s, o) => s + o.orderValueUsd, 0);
    expect(r.rows[0].value).toBeCloseTo(manual, 6);
  });

  it("avg_discount_pct averages only over promo orders", () => {
    const r = runQuery(orders, {
      tool: "query",
      metric: "avg_discount_pct",
      filters: {},
    });
    const promo = orders.filter((o) => o.isPromo);
    const manual =
      promo.reduce((s, o) => s + o.promoDiscountPct, 0) / promo.length;
    expect(r.rows[0].value).toBeCloseTo(manual, 6);
    // Sanity: non-promo orders (0% discount) must not drag it toward 0.
    expect(r.rows[0].value).toBeGreaterThan(10);
  });
});

describe("forecasting", () => {
  it("produces the requested number of forecast months for a category", () => {
    const r = runForecast(orders, {
      tool: "forecast",
      dimension: "product_category",
      dimensionValue: "PAPER",
      metric: "quantity",
      forecastMonths: 3,
    });
    expect(r.forecast.length).toBe(3);
    expect(r.series.length).toBe(r.history.length + 3);
    expect(r.forecast.every((p) => p.value >= 0)).toBe(true);
    expect(r.inventoryRecommendation).toBeTruthy();
  });

  it("flags sparse SKU series with a warning", () => {
    // Pick a SKU that appears only once.
    const counts = new Map<string, number>();
    for (const o of orders) counts.set(o.sku, (counts.get(o.sku) ?? 0) + 1);
    const rareSku = [...counts.entries()].find(([, n]) => n === 1)![0];
    const r = runForecast(orders, {
      tool: "forecast",
      dimension: "sku",
      dimensionValue: rareSku,
      metric: "quantity",
      forecastMonths: 3,
    });
    expect(r.sparse).toBe(true);
    expect(r.warning).toBeTruthy();
  });

  it("handles unknown dimension value gracefully", () => {
    const r = runForecast(orders, {
      tool: "forecast",
      dimension: "product_category",
      dimensionValue: "NONEXISTENT",
      metric: "quantity",
      forecastMonths: 3,
    });
    expect(r.history.length).toBe(0);
    expect(r.warning).toBeTruthy();
  });
});
