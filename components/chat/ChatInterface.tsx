"use client";

import { useState } from "react";
import ExplainPanel from "./ExplainPanel";
import { ForecastChart, QueryResultChart } from "./ResultChart";

interface ApiResponse {
  tool: "query" | "forecast";
  answer: string;
  interpretation: string;
  explain: any;
  result?: { rows: { group: string; value: number }[]; metric: string; groupBy: string | null };
  forecast?: {
    series: { month: string; value: number; type: "history" | "forecast" }[];
    methodology: string;
    inventoryRecommendation: string;
    warning?: string;
  };
  underlyingRows: Record<string, unknown>[];
  underlyingRowCount: number;
}

interface Turn {
  question: string;
  loading: boolean;
  error?: string;
  data?: ApiResponse;
}

const EXAMPLES = [
  "Which carrier has the highest delay rate?",
  "How many delayed orders by month?",
  "What is the on-time rate for FedEx?",
  "Average delivery time by region",
  "Total order value by product category",
  "Forecast demand for PAINT for the next 3 months",
];

export default function ChatInterface() {
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);

  async function ask(q: string) {
    const question = q.trim();
    if (!question) return;
    setInput("");
    const idx = turns.length;
    setTurns((t) => [...t, { question, loading: true }]);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const json = await res.json();
      if (!res.ok) {
        setTurns((t) =>
          t.map((turn, i) =>
            i === idx ? { ...turn, loading: false, error: json.error || "Request failed." } : turn,
          ),
        );
        return;
      }
      setTurns((t) =>
        t.map((turn, i) => (i === idx ? { ...turn, loading: false, data: json } : turn)),
      );
    } catch (e: any) {
      setTurns((t) =>
        t.map((turn, i) =>
          i === idx ? { ...turn, loading: false, error: e?.message || "Network error." } : turn,
        ),
      );
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about KPIs, breakdowns, or forecasts…"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Ask
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => ask(ex)}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {turns.length === 0 && (
        <p className="px-1 text-sm text-slate-400">
          Ask a question to get started. Every answer shows exactly how it was
          computed — the AI only routes; the numbers come from a deterministic
          engine.
        </p>
      )}

      <div className="space-y-4">
        {[...turns].reverse().map((turn, ri) => {
          const i = turns.length - 1 - ri;
          return (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-start gap-2">
                <span className="mt-0.5 rounded bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                  You
                </span>
                <p className="font-medium text-slate-800">{turn.question}</p>
              </div>

              {turn.loading && (
                <p className="animate-pulse text-sm text-slate-400">Routing &amp; computing…</p>
              )}

              {turn.error && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  {turn.error}
                </div>
              )}

              {turn.data && (
                <div>
                  <p className="text-slate-800">{turn.data.answer}</p>

                  {turn.data.tool === "query" &&
                    turn.data.result &&
                    turn.data.result.groupBy &&
                    turn.data.result.rows.length > 1 && (
                      <div className="mt-3">
                        <QueryResultChart
                          rows={turn.data.result.rows}
                          metric={turn.data.result.metric}
                          groupBy={turn.data.result.groupBy}
                        />
                      </div>
                    )}

                  {turn.data.tool === "forecast" && turn.data.forecast && (
                    <div className="mt-3 space-y-2">
                      {turn.data.forecast.warning && (
                        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          ⚠ {turn.data.forecast.warning}
                        </div>
                      )}
                      <ForecastChart series={turn.data.forecast.series} />
                      <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                        <p className="font-semibold text-slate-700">Inventory recommendation</p>
                        <p>{turn.data.forecast.inventoryRecommendation}</p>
                        <p className="mt-2 font-semibold text-slate-700">Methodology</p>
                        <p>{turn.data.forecast.methodology}</p>
                      </div>
                    </div>
                  )}

                  <ExplainPanel
                    interpretation={turn.data.interpretation}
                    explain={turn.data.explain}
                    underlyingRows={turn.data.underlyingRows}
                    underlyingRowCount={turn.data.underlyingRowCount}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
