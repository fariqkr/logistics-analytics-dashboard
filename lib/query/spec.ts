import { z } from "zod";

/**
 * The typed query contract. The AI router NEVER computes numbers — it only
 * fills in one of these structured specs, which the deterministic compute
 * layer then executes. This is the hard boundary between (1) AI interpretation
 * and (2) data computation required by the spec.
 *
 * Everything the AI can express is enumerated here. Anything outside this
 * surface is, by construction, an unsupported query.
 */

export const METRICS = [
  "order_count", // COUNT(*)
  "delayed_count", // COUNT WHERE status=delayed
  "delivered_count", // COUNT WHERE status=delivered
  "delay_rate", // delayed / (delivered + delayed), over settled orders
  "on_time_rate", // delivered / (delivered + delayed), over settled orders
  "avg_delivery_days", // mean(deliveryDays) over non-null delivery_date
  "total_order_value", // SUM(order_value_usd)
  "avg_order_value", // MEAN(order_value_usd)
  "total_quantity", // SUM(quantity)
  "avg_discount_pct", // MEAN(promo_discount_pct) over promo orders (is_promo=true)
] as const;

export const DIMENSIONS = [
  "carrier",
  "region",
  "product_category",
  "status",
  "warehouse",
  "sku",
  "week", // ISO week of order_date
  "month", // YYYY-MM of order_date
] as const;

export const STATUS_VALUES = [
  "delivered",
  "delayed",
  "in_transit",
  "exception",
  "canceled",
] as const;

export const QueryFiltersSchema = z
  .object({
    status: z.enum(STATUS_VALUES).optional(),
    carrier: z.string().optional(),
    region: z.string().optional(),
    productCategory: z.string().optional(),
    sku: z.string().optional(),
    warehouse: z.string().optional(),
    isPromo: z.boolean().optional(),
    /** Inclusive ISO date lower bound on order_date. */
    dateFrom: z.string().optional(),
    /** Inclusive ISO date upper bound on order_date. */
    dateTo: z.string().optional(),
  })
  .strict();

export const QuerySpecSchema = z
  .object({
    tool: z.literal("query"),
    metric: z.enum(METRICS),
    filters: QueryFiltersSchema.default({}),
    groupBy: z.enum(DIMENSIONS).optional(),
    orderBy: z
      .object({
        direction: z.enum(["asc", "desc"]).default("desc"),
      })
      .optional(),
    limit: z.number().int().positive().max(100).optional(),
  })
  .strict();

export const ForecastSpecSchema = z
  .object({
    tool: z.literal("forecast"),
    dimension: z.enum(["product_category", "sku"]),
    dimensionValue: z.string(),
    metric: z.enum(["quantity", "order_value"]),
    forecastMonths: z.number().int().min(1).max(6).default(3),
  })
  .strict();

export const ToolSpecSchema = z.discriminatedUnion("tool", [
  QuerySpecSchema,
  ForecastSpecSchema,
]);

export type QueryFilters = z.infer<typeof QueryFiltersSchema>;
export type QuerySpec = z.infer<typeof QuerySpecSchema>;
export type ForecastSpec = z.infer<typeof ForecastSpecSchema>;
export type ToolSpec = z.infer<typeof ToolSpecSchema>;
export type Metric = (typeof METRICS)[number];
export type Dimension = (typeof DIMENSIONS)[number];
