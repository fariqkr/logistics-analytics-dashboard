import Anthropic from "@anthropic-ai/sdk";
import { ToolSpecSchema, type ToolSpec } from "../query/spec";

/**
 * AI ROUTER / ORCHESTRATOR.
 *
 * The model's ONLY job is interpretation + routing: read the user's question,
 * choose one of two tools (query | forecast), and emit a STRUCTURED spec by
 * calling the corresponding tool. It is explicitly forbidden (by prompt and by
 * construction) from producing numeric answers — the numbers come from the
 * deterministic compute layer that executes the returned spec.
 *
 * We use Anthropic tool-use to force structured output. The tool input schema
 * mirrors our Zod contract; we still re-validate with Zod before executing.
 */

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

export interface RouteResult {
  spec: ToolSpec;
  /** Plain-language read of what the model thinks the user asked. */
  interpretation: string;
  /** Which tool was selected. */
  tool: "query" | "forecast";
}

export class RouterError extends Error {
  constructor(
    message: string,
    public kind: "no_key" | "unsupported" | "model_error" | "invalid_spec",
  ) {
    super(message);
  }
}

const SYSTEM = `You are the routing layer of a logistics analytics system.

Your ONLY job is to translate a user's natural-language question into a STRUCTURED tool call. You must NEVER state a numeric answer, count, rate, average, or forecast value yourself. A separate deterministic engine computes all numbers from the data. If you output a number, the system is wrong.

You route between exactly two tools:

1. run_query — for KPIs, counts, rates, aggregations, breakdowns, filtering, and time series over HISTORICAL orders. Examples: "how many delayed orders", "which carrier has the highest delay rate", "delayed orders by week", "average delivery time for FedEx in the EU", "total order value by region".

2. run_forecast — for FUTURE demand prediction of a product category or SKU over upcoming months. Examples: "forecast demand for PAINT next quarter", "predict quantity for category CRAYON for the next 3 months".

Dataset facts you may rely on (do NOT invent others):
- statuses: delivered, delayed, in_transit, exception, canceled
- carriers: FedEx, UPS, DHL, USPS, OnTrac, LaserShip, Royal Mail, DPD, GLS
- regions: US-E, US-W, EU, US-C, UK
- product_category: BOOK, BRUSH, CRAYON, MARKER, PAINT, PAPER, PENCIL, STICKER
- order_date range: 2025-01-01 .. 2025-12-30 (the LATEST order_date in the data is 2025-12-30)

Rules:
- Always include a short "interpretation" describing what you understood.
- Map metric/dimension/filter values to the allowed enums. Use the exact carrier/region/category spelling above (case-insensitive matching happens downstream, but prefer canonical spelling).
- RELATIVE DATES: anchor every relative time expression to the dataset's latest date (2025-12-30), NOT to the real-world current date. So "last month" => 2025-12-01..2025-12-31; "last 3 months" => 2025-10-01..2025-12-30; "last week" => the final week of the data; "last quarter" => 2025-10-01..2025-12-30; "this year" => 2025-01-01..2025-12-30. Set filters.dateFrom and filters.dateTo accordingly. Be consistent — always count backward from 2025-12-30.
- "highest/lowest X by Y" => metric=X, groupBy=Y, set orderBy.direction and a small limit if they asked for a single winner.
- COMPARISONS: "compare X for A and B" or "A vs B" (e.g. "compare delay rates between UPS and DHL") => groupBy the relevant dimension and DO NOT add a filter that keeps only one value. The user sees every group (including both named values) and can compare. Never answer a two-way comparison by filtering to just one of the two.
- "delay rate" => metric "delay_rate"; "on-time rate" => "on_time_rate".
- "average/avg discount" or "promo discount" => metric "avg_discount_pct" (this IS supported — the data has a promo_discount_pct field; it is averaged over promo orders).
- "delayed orders by week" => metric "delayed_count" (or order_count with status=delayed) groupBy "week".
- For forecasts, choose dimension product_category unless the user clearly names a single SKU.
- If the question cannot be answered with these two tools and this dataset (e.g. asks about customer names, profit margins, weather, or data not present), DO NOT call a tool — instead respond in plain text starting with "UNSUPPORTED:" and briefly say why.`;

const tools: Anthropic.Tool[] = [
  {
    name: "run_query",
    description:
      "Compute a KPI / aggregation / breakdown over historical orders. Fill in the structured query; the engine computes the numbers.",
    input_schema: {
      type: "object",
      properties: {
        interpretation: {
          type: "string",
          description: "One sentence: what you understood the user to be asking.",
        },
        metric: {
          type: "string",
          enum: [
            "order_count",
            "delayed_count",
            "delivered_count",
            "delay_rate",
            "on_time_rate",
            "avg_delivery_days",
            "total_order_value",
            "avg_order_value",
            "total_quantity",
            "avg_discount_pct",
          ],
        },
        filters: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["delivered", "delayed", "in_transit", "exception", "canceled"],
            },
            carrier: { type: "string" },
            region: { type: "string" },
            productCategory: { type: "string" },
            sku: { type: "string" },
            warehouse: { type: "string" },
            isPromo: { type: "boolean" },
            dateFrom: { type: "string", description: "Inclusive ISO date YYYY-MM-DD on order_date" },
            dateTo: { type: "string", description: "Inclusive ISO date YYYY-MM-DD on order_date" },
          },
          additionalProperties: false,
        },
        groupBy: {
          type: "string",
          enum: [
            "carrier",
            "region",
            "product_category",
            "status",
            "warehouse",
            "sku",
            "week",
            "month",
          ],
        },
        orderBy: {
          type: "object",
          properties: { direction: { type: "string", enum: ["asc", "desc"] } },
          additionalProperties: false,
        },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
      required: ["interpretation", "metric"],
    },
  },
  {
    name: "run_forecast",
    description:
      "Forecast future demand for a product category or SKU. Fill in the structured spec; the engine computes the forecast.",
    input_schema: {
      type: "object",
      properties: {
        interpretation: { type: "string" },
        dimension: { type: "string", enum: ["product_category", "sku"] },
        dimensionValue: { type: "string" },
        metric: { type: "string", enum: ["quantity", "order_value"] },
        forecastMonths: { type: "integer", minimum: 1, maximum: 6 },
      },
      required: ["interpretation", "dimension", "dimensionValue", "metric"],
    },
  },
];

export async function routeQuestion(question: string): Promise<RouteResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new RouterError(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local (see .env.local.example).",
      "no_key",
    );
  }

  const client = new Anthropic({ apiKey });

  let msg: Anthropic.Message;
  try {
    msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      tools,
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: question }],
    });
  } catch (e: any) {
    throw new RouterError(e?.message || "Model request failed.", "model_error");
  }

  const toolUse = msg.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );

  if (!toolUse) {
    // Model declined to route — surface its text (likely an UNSUPPORTED note).
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();
    throw new RouterError(
      text || "This question can't be answered with the available tools.",
      "unsupported",
    );
  }

  const input = toolUse.input as Record<string, unknown>;
  const interpretation = (input.interpretation as string) || "";

  // Re-shape the tool input into our discriminated ToolSpec and validate.
  const rawSpec =
    toolUse.name === "run_query"
      ? {
          tool: "query",
          metric: input.metric,
          filters: input.filters ?? {},
          groupBy: input.groupBy,
          orderBy: input.orderBy,
          limit: input.limit,
        }
      : {
          tool: "forecast",
          dimension: input.dimension,
          dimensionValue: input.dimensionValue,
          metric: input.metric,
          forecastMonths: input.forecastMonths ?? 3,
        };

  const parsed = ToolSpecSchema.safeParse(rawSpec);
  if (!parsed.success) {
    throw new RouterError(
      "The router produced an invalid query spec: " + parsed.error.message,
      "invalid_spec",
    );
  }

  return {
    spec: parsed.data,
    interpretation,
    tool: parsed.data.tool,
  };
}
