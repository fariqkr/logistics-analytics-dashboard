"use client";

import { useState } from "react";

/**
 * Explainability panel — REQUIRED on every NL answer. Shows:
 *  - filters applied (time range etc.)
 *  - metrics + dimensions used
 *  - the structured query plan / interpretation
 *  - the underlying rows as a table
 */
export default function ExplainPanel({
  interpretation,
  explain,
  underlyingRows,
  underlyingRowCount,
}: {
  interpretation: string;
  explain: {
    toolSelected: string;
    metric: string;
    groupBy: string | null;
    filtersApplied: string[];
    structuredPlan: unknown;
    matchedCount: number;
  };
  underlyingRows: Record<string, unknown>[];
  underlyingRowCount: number;
}) {
  const [showRows, setShowRows] = useState(false);
  const [showPlan, setShowPlan] = useState(false);

  const cols =
    underlyingRows.length > 0 ? Object.keys(underlyingRows[0]) : [];

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
          Explainability
        </span>
        <span className="text-xs text-slate-500">
          how this answer was produced
        </span>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
        <Row label="Tool selected" value={explain.toolSelected} />
        <Row label="Metric" value={explain.metric} />
        <Row label="Dimension" value={explain.groupBy ?? "— (no breakdown)"} />
        <Row label="Rows matched" value={String(explain.matchedCount)} />
        <div className="sm:col-span-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Interpretation
          </span>
          <p className="text-slate-700">{interpretation || "—"}</p>
        </div>
        <div className="sm:col-span-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Filters applied
          </span>
          <div className="mt-1 flex flex-wrap gap-1">
            {explain.filtersApplied.map((f, i) => (
              <span
                key={i}
                className="rounded bg-white px-2 py-0.5 text-xs text-slate-600 ring-1 ring-slate-200"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      </dl>

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => setShowPlan((v) => !v)}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
        >
          {showPlan ? "Hide" : "Show"} structured plan
        </button>
        <button
          onClick={() => setShowRows((v) => !v)}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
        >
          {showRows ? "Hide" : "Show"} underlying rows ({underlyingRowCount})
        </button>
      </div>

      {showPlan && (
        <pre className="mt-2 overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-100">
          {JSON.stringify(explain.structuredPlan, null, 2)}
        </pre>
      )}

      {showRows && (
        <div className="mt-2 max-h-72 overflow-auto rounded border border-slate-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-100 text-slate-600">
              <tr>
                {cols.map((c) => (
                  <th key={c} className="whitespace-nowrap px-2 py-1 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {underlyingRows.map((r, i) => (
                <tr key={i} className="border-t border-slate-100">
                  {cols.map((c) => (
                    <td key={c} className="whitespace-nowrap px-2 py-1 text-slate-600">
                      {r[c] === null ? "—" : String(r[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {underlyingRowCount > underlyingRows.length && (
            <div className="px-2 py-1 text-[11px] text-slate-400">
              Showing first {underlyingRows.length} of {underlyingRowCount} rows.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <p className="text-slate-700">{value}</p>
    </div>
  );
}
