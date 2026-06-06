import { NextResponse } from "next/server";
import { getOrders } from "@/lib/data";
import { routeQuestion, RouterError } from "@/lib/ai/router";
import { runQuery } from "@/lib/compute/aggregations";
import { runForecast } from "@/lib/compute/forecasting";
import { buildAnswer, describeFilters, metricLabel } from "@/lib/answer";
import type { Order } from "@/lib/types";

/**
 * Unified natural-language endpoint.
 *
 * Flow: question -> (1) AI router picks a tool + builds a structured spec ->
 * (2)/(3) deterministic engine computes -> we assemble an answer + the
 * explainability payload (filters, metric/dimensions, the structured plan, and
 * the underlying rows). The AI never touches the numbers.
 */
export const runtime = "nodejs";

// Keep the row dump light for the client.
function trimRows(rows: Order[], limit = 50) {
  return rows.slice(0, limit).map((o) => ({
    orderId: o.orderId,
    orderDate: o.orderDate,
    deliveryDate: o.deliveryDate,
    carrier: o.carrier,
    region: o.region,
    status: o.status,
    productCategory: o.productCategory,
    sku: o.sku,
    quantity: o.quantity,
    orderValueUsd: o.orderValueUsd,
    deliveryDays: o.deliveryDays,
  }));
}

export async function POST(req: Request) {
  let question = "";
  try {
    const body = await req.json();
    question = (body?.question ?? "").toString().trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!question) {
    return NextResponse.json({ error: "Please provide a question." }, { status: 400 });
  }

  const orders = getOrders();

  let routed;
  try {
    routed = await routeQuestion(question);
  } catch (e) {
    if (e instanceof RouterError) {
      const status = e.kind === "no_key" ? 500 : e.kind === "unsupported" ? 422 : 400;
      return NextResponse.json(
        { error: e.message, kind: e.kind, question },
        { status },
      );
    }
    return NextResponse.json({ error: "Routing failed." }, { status: 500 });
  }

  // ---- QUERY TOOL ----
  if (routed.spec.tool === "query") {
    const spec = routed.spec;
    const result = runQuery(orders, spec);
    const answer = buildAnswer(spec, result);

    return NextResponse.json({
      tool: "query",
      question,
      answer,
      interpretation: routed.interpretation,
      explain: {
        toolSelected: "Query Tool",
        metric: metricLabel(spec.metric),
        metricKey: spec.metric,
        groupBy: spec.groupBy ?? null,
        filtersApplied: describeFilters(spec.filters),
        structuredPlan: spec,
        matchedCount: result.matchedCount,
      },
      result: {
        rows: result.rows, // {group, value, rowCount}
        metric: spec.metric,
        groupBy: spec.groupBy ?? null,
      },
      underlyingRows: trimRows(result.matchedRows),
      underlyingRowCount: result.matchedCount,
    });
  }

  // ---- FORECAST TOOL ----
  const spec = routed.spec;
  const fc = runForecast(orders, spec);
  // Underlying rows = the orders feeding the forecast.
  const feed = orders.filter((o) =>
    spec.dimension === "sku"
      ? o.sku.toLowerCase() === spec.dimensionValue.toLowerCase()
      : o.productCategory.toLowerCase() === spec.dimensionValue.toLowerCase(),
  );

  const answer =
    fc.history.length === 0
      ? fc.warning ?? "No data to forecast."
      : `Forecast for ${spec.dimensionValue} (${spec.metric === "quantity" ? "units" : "order value"}): next ${fc.forecast.length} month(s) average ~${Math.round(fc.forecastMonthlyAvg)} vs historical ~${Math.round(fc.historicalMonthlyAvg)}/month. ${fc.inventoryRecommendation}`;

  return NextResponse.json({
    tool: "forecast",
    question,
    answer,
    interpretation: routed.interpretation,
    explain: {
      toolSelected: "Forecasting Tool",
      metric: spec.metric === "quantity" ? "monthly quantity" : "monthly order value (USD)",
      groupBy: spec.dimension,
      filtersApplied: [`${spec.dimension} = ${spec.dimensionValue}`],
      structuredPlan: spec,
      matchedCount: feed.length,
    },
    forecast: {
      series: fc.series,
      history: fc.history,
      forecast: fc.forecast,
      methodology: fc.methodology,
      inventoryRecommendation: fc.inventoryRecommendation,
      historicalMonthlyAvg: fc.historicalMonthlyAvg,
      forecastMonthlyAvg: fc.forecastMonthlyAvg,
      sparse: fc.sparse,
      warning: fc.warning,
    },
    underlyingRows: trimRows(feed as Order[]),
    underlyingRowCount: feed.length,
  });
}
