"use client";

import React from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

interface TablePaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;
}

export function TablePagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [15, 30, 50, 100],
  itemLabel = "registros",
}: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIdx = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIdx = Math.min(totalItems, safePage * pageSize);

  const visiblePages = React.useMemo(() => {
    const pages: number[] = [];
    const maxButtons = 5;
    let start = Math.max(1, safePage - Math.floor(maxButtons / 2));
    const end = Math.min(totalPages, start + maxButtons - 1);
    if (end - start + 1 < maxButtons) {
      start = Math.max(1, end - maxButtons + 1);
    }
    for (let p = start; p <= end; p++) {
      pages.push(p);
    }
    return pages;
  }, [safePage, totalPages]);

  if (totalItems === 0) {
    return null;
  }

  return (
    <div className="px-4 sm:px-5 py-3 bg-[#09090b] border-t border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
      <div className="flex flex-wrap items-center gap-3 text-zinc-400">
        <span className="font-mono text-[11px] tabular-nums">
          Exibindo <strong className="text-zinc-100">{startIdx}</strong>–
          <strong className="text-zinc-100">{endIdx}</strong> de{" "}
          <strong className="text-zinc-100">{totalItems}</strong> {itemLabel}
        </span>

        {onPageSizeChange && (
          <div className="inline-flex items-center gap-1.5">
            <span className="text-[11px] text-zinc-500">Por página:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-7 px-2 rounded-md border border-zinc-800 bg-[#121215] text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-zinc-600"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={safePage <= 1}
          title="Primeira página"
          className="h-7 w-7 rounded-md border border-zinc-800 bg-[#121215] hover:bg-zinc-800 text-zinc-300 disabled:opacity-35 disabled:pointer-events-none flex items-center justify-center transition-colors"
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={() => onPageChange(safePage - 1)}
          disabled={safePage <= 1}
          title="Página anterior"
          className="h-7 px-2 rounded-md border border-zinc-800 bg-[#121215] hover:bg-zinc-800 text-zinc-300 disabled:opacity-35 disabled:pointer-events-none inline-flex items-center gap-1 text-[11px] font-medium transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Anterior</span>
        </button>

        <div className="flex items-center gap-1 mx-0.5">
          {visiblePages.map((p) => {
            const active = p === safePage;
            return (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                className={`h-7 min-w-[28px] px-1.5 rounded-md font-mono text-[11px] tabular-nums transition-colors ${
                  active
                    ? "bg-zinc-100 text-zinc-950 font-bold"
                    : "border border-zinc-800 bg-[#121215] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => onPageChange(safePage + 1)}
          disabled={safePage >= totalPages}
          title="Próxima página"
          className="h-7 px-2 rounded-md border border-zinc-800 bg-[#121215] hover:bg-zinc-800 text-zinc-300 disabled:opacity-35 disabled:pointer-events-none inline-flex items-center gap-1 text-[11px] font-medium transition-colors"
        >
          <span className="hidden sm:inline">Próxima</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={safePage >= totalPages}
          title="Última página"
          className="h-7 w-7 rounded-md border border-zinc-800 bg-[#121215] hover:bg-zinc-800 text-zinc-300 disabled:opacity-35 disabled:pointer-events-none flex items-center justify-center transition-colors"
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
