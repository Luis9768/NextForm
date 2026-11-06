"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  Phone,
  Search,
  ShieldAlert,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { TablePagination } from "@/components/ui/TablePagination";
import { useAuth } from "@/context/AuthContext";
import { dashboardApi, usersApi } from "@/lib/api";
import { DashboardSummary } from "@/types";

const AVAILABLE_SECTORS = ["Aquisição", "Cobrança & Retenção", "SAC"];

export default function AnalystsDirectoryPage() {
  const { isGestor } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [sectorFilter, setSectorFilter] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [updatingAnalystId, setUpdatingAnalystId] = useState<string | null>(
    null
  );

  const { data: summary, isLoading } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => dashboardApi.getSummary(),
    enabled: isGestor,
  });

  const changeSectorMutation = useMutation({
    mutationFn: ({
      analystId,
      newSector,
    }: {
      analystId: string;
      newSector: string;
    }) => {
      setUpdatingAnalystId(analystId);
      return usersApi.changeSector(analystId, {
        newSector,
        reason: "Alteração de setor pela gestão (histórico preservado)",
      });
    },
    onMutate: async ({ analystId, newSector }) => {
      await queryClient.cancelQueries({ queryKey: ["dashboard-summary"] });
      const prevSummary = queryClient.getQueryData<DashboardSummary>([
        "dashboard-summary",
      ]);
      if (prevSummary) {
        queryClient.setQueryData<DashboardSummary>(["dashboard-summary"], {
          ...prevSummary,
          analystRanking: prevSummary.analystRanking.map((a) =>
            a.analystId === analystId ? { ...a, department: newSector } : a
          ),
        });
      }
      return { prevSummary };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prevSummary) {
        queryClient.setQueryData(["dashboard-summary"], ctx.prevSummary);
      }
    },
    onSettled: (_data, _err, { analystId }) => {
      setUpdatingAnalystId(null);
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["analysts-sidebar-list"] });
      queryClient.invalidateQueries({
        queryKey: ["analyst-profile", analystId],
      });
    },
  });

  const filteredAnalysts = useMemo(() => {
    const list = summary?.analystRanking ?? [];
    const q = searchQuery.trim().toLowerCase();
    return list.filter((analyst) => {
      if (sectorFilter !== "ALL" && analyst.department !== sectorFilter) {
        return false;
      }
      if (!q) return true;
      return (
        analyst.analystName.toLowerCase().includes(q) ||
        analyst.analystEmail.toLowerCase().includes(q) ||
        (analyst.department && analyst.department.toLowerCase().includes(q))
      );
    });
  }, [summary?.analystRanking, searchQuery, sectorFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredAnalysts.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedAnalysts = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredAnalysts.slice(start, start + pageSize);
  }, [filteredAnalysts, safePage, pageSize]);

  if (!isGestor) {
    return (
      <AppShell>
        <div className="p-6 rounded-2xl border border-red-800 bg-red-950/40 text-red-200 text-sm">
          Acesso restrito ao perfil <strong>ROLE_GESTOR</strong>.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-5 pb-16">
        {/* Header + Barra de Busca e Filtro de Setor */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3.5 rounded-xl border border-zinc-800/80 bg-[#0e0e11]">
          <div className="flex items-center gap-2.5">
            <Users className="h-5 w-5 text-zinc-400 shrink-0" />
            <h1 className="text-base sm:text-lg font-bold text-zinc-100">
              Analistas ({filteredAnalysts.length})
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 flex-1 lg:justify-end">
            <div className="relative w-full sm:w-72">
              <Search className="h-3.5 w-3.5 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Buscar analista por nome, e-mail ou setor..."
                className="w-full h-8 pl-8 pr-8 rounded-md border border-zinc-800 bg-[#09090b] text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setCurrentPage(1);
                  }}
                  title="Limpar busca"
                  className="absolute right-2.5 top-2 text-zinc-500 hover:text-zinc-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="inline-flex flex-wrap items-center p-0.5 rounded-lg bg-[#09090b] border border-zinc-800/80">
              {["ALL", ...AVAILABLE_SECTORS].map((sec) => {
                const active = sectorFilter === sec;
                return (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => {
                      setSectorFilter(sec);
                      setCurrentPage(1);
                    }}
                    className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors ${
                      active
                        ? "bg-zinc-100 text-zinc-950 font-semibold"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {sec === "ALL" ? "Todos" : sec}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {isLoading || !summary ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-52 w-full max-w-[340px] rounded-xl border border-zinc-800 shadcn-kpi-card animate-pulse p-4"
              />
            ))}
          </div>
        ) : filteredAnalysts.length === 0 ? (
          <div className="py-12 text-center rounded-2xl border border-zinc-800/80 bg-[#0e0e11] space-y-2">
            <Users className="h-6 w-6 text-zinc-500 mx-auto" />
            <p className="text-xs text-zinc-400">
              Nenhum analista encontrado para a busca informada.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {paginatedAnalysts.map((analyst) => {
                const isUpdatingThis = updatingAnalystId === analyst.analystId;
                return (
                  <div
                    key={analyst.analystId}
                    className="w-full max-w-[340px] rounded-xl border border-zinc-200 dark:border-zinc-800/90 shadcn-kpi-card p-4 flex flex-col justify-between hover:border-zinc-500 dark:hover:border-zinc-600 transition-colors group overflow-hidden"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="h-9 w-9 rounded-lg bg-zinc-200 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 flex items-center justify-center font-mono font-bold text-xs text-zinc-900 dark:text-zinc-100 shrink-0">
                            {analyst.analystName
                              .split(" ")
                              .map((n) => n[0])
                              .slice(0, 2)
                              .join("")}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-white truncate">
                              {analyst.analystName}
                            </h2>
                            <p className="text-[11px] font-mono text-zinc-500 truncate">
                              {analyst.analystEmail}
                            </p>
                          </div>
                        </div>

                        <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold tabular-nums border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 whitespace-nowrap shrink-0">
                          {Number(analyst.averageScore).toFixed(1)}%
                        </span>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] text-zinc-400 flex items-center justify-between gap-1.5">
                          <span className="inline-flex items-center gap-1.5">
                            <UserCheck className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                            <span>Setor</span>
                          </span>
                          {isUpdatingThis && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              <span>Salvando...</span>
                            </span>
                          )}
                        </label>
                        <select
                          value={analyst.department}
                          disabled={isUpdatingThis}
                          onChange={(e) =>
                            changeSectorMutation.mutate({
                              analystId: analyst.analystId,
                              newSector: e.target.value,
                            })
                          }
                          className="w-full h-8 px-2.5 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs font-medium text-zinc-200 focus:outline-none focus:border-zinc-600 disabled:opacity-60"
                        >
                          {!AVAILABLE_SECTORS.includes(analyst.department) && (
                            <option value={analyst.department}>
                              {analyst.department}
                            </option>
                          )}
                          {AVAILABLE_SECTORS.map((sec) => (
                            <option key={sec} value={sec}>
                              {sec}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5 pt-2.5 border-t border-zinc-200 dark:border-zinc-800/80 text-center">
                        <div className="p-2 rounded-lg bg-zinc-100/60 dark:bg-zinc-900/60 overflow-hidden">
                          <span className="text-[10px] font-mono text-zinc-500 uppercase block whitespace-nowrap">
                            Avaliadas
                          </span>
                          <span className="text-xs font-bold font-mono tabular-nums text-zinc-900 dark:text-zinc-100 mt-0.5 block">
                            {analyst.evaluatedCalls}
                          </span>
                        </div>
                        <div className="p-2 rounded-lg bg-zinc-100/60 dark:bg-zinc-900/60 overflow-hidden">
                          <span className="text-[10px] font-mono text-zinc-500 uppercase flex items-center justify-center gap-1 whitespace-nowrap">
                            <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                            <span>Aprov.</span>
                          </span>
                          <span className="text-xs font-bold font-mono tabular-nums text-emerald-500 mt-0.5 block">
                            {analyst.approvedCount}
                          </span>
                        </div>
                        <div className="p-2 rounded-lg bg-zinc-100/60 dark:bg-zinc-900/60 overflow-hidden">
                          <span className="text-[10px] font-mono text-zinc-500 uppercase flex items-center justify-center gap-1 whitespace-nowrap">
                            <ShieldAlert className="h-3 w-3 text-red-400 shrink-0" />
                            <span>Fatal</span>
                          </span>
                          <span className="text-xs font-bold font-mono tabular-nums text-red-400 mt-0.5 block">
                            {analyst.fatalErrorCount}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 mt-3 border-t border-zinc-200 dark:border-zinc-800/80">
                      <Link
                        href={`/analysts/${analyst.analystId}?sector=${encodeURIComponent(
                          analyst.department || "SAC"
                        )}`}
                        className="w-full h-8.5 py-2 px-3 rounded-lg bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm whitespace-nowrap"
                      >
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        <span>Avaliar</span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-xl border border-zinc-800/80 overflow-hidden">
              <TablePagination
                currentPage={safePage}
                totalItems={filteredAnalysts.length}
                pageSize={pageSize}
                pageSizeOptions={[12, 24, 48, 96]}
                onPageChange={setCurrentPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setCurrentPage(1);
                }}
                itemLabel="analistas"
              />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
