"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Activity,
  Award,
  BarChart3,
  Cpu,
  Gauge,
  RefreshCw,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/context/AuthContext";
import { studioApi } from "@/lib/api";
import { formatDuration } from "@/lib/utils";

export default function DirectusBenchmarksPage() {
  const { isGestor } = useAuth();

  const {
    data: bench,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["studio-benchmarks"],
    queryFn: studioApi.getBenchmarks,
    enabled: isGestor,
  });

  if (!isGestor) {
    return (
      <AppShell>
        <div className="p-6 rounded-xl border border-zinc-800 bg-[#101013] text-zinc-300 text-sm">
          Acesso restrito: O módulo <strong>Indicadores & Benchmarks</strong> é
          exclusivo para a gestão (<strong>ROLE_GESTOR</strong>).
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6 pb-16">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800/80">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-500">
              <span>NEXFORM</span>
              <span>/</span>
              <span className="text-zinc-300">Indicadores & Benchmarks</span>
            </div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 mt-0.5">
              <Gauge className="h-5 w-5 text-zinc-400 shrink-0" />
              <span>Benchmarks de Qualidade, Pessoas & Performance</span>
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
              Comparativo da equipe contra a meta corporativa (80%), aderência
              por etapa da ligação e telemetria de latência do sistema.
            </p>
          </div>

          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-9 px-4 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-zinc-200 text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 self-start lg:self-auto"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 shrink-0 ${
                isFetching ? "animate-spin" : ""
              }`}
            />
            <span>Executar Benchmark Agora</span>
          </button>
        </div>

        {isLoading || !bench ? (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-36 rounded-xl border border-zinc-800 bg-[#101013] animate-pulse p-5"
              />
            ))}
          </div>
        ) : (
          <>
            {/* 4 Top Benchmark Cards (Container-Aware Auto-Fit Grid) */}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-zinc-800/90 shadcn-kpi-card p-5 space-y-2"
              >
                <div className="flex items-center justify-between gap-2 text-xs text-zinc-400">
                  <span>Média vs Meta Benchmark</span>
                  <Award className="h-4 w-4 text-zinc-400 shrink-0" />
                </div>
                <p className="text-3xl font-bold font-mono text-zinc-50">
                  {Number(bench.currentTeamAverage).toFixed(1)}%{" "}
                  <span className="text-xs font-normal text-zinc-500">
                    / {Number(bench.companyTargetScore).toFixed(0)}%
                  </span>
                </p>
                <p className="text-xs text-zinc-500">
                  Meta corporativa estabelecida em 80.0%
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="rounded-xl border border-zinc-800/90 shadcn-kpi-card p-5 space-y-2"
              >
                <div className="flex items-center justify-between gap-2 text-xs text-zinc-400">
                  <span>Índice sem Erro Grave</span>
                  <ShieldCheck className="h-4 w-4 text-zinc-400 shrink-0" />
                </div>
                <p className="text-3xl font-bold font-mono text-zinc-50">
                  {Number(bench.complianceRateWithoutFatal).toFixed(1)}%
                </p>
                <p className="text-xs text-zinc-500">
                  Ligações livres de violações eliminatórias
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="rounded-xl border border-zinc-800/90 shadcn-kpi-card p-5 space-y-2"
              >
                <div className="flex items-center justify-between gap-2 text-xs text-zinc-400">
                  <span>TMA Médio Auditado</span>
                  <Activity className="h-4 w-4 text-zinc-400 shrink-0" />
                </div>
                <p className="text-3xl font-bold font-mono text-zinc-50">
                  {formatDuration(bench.averageCallDurationSeconds)}
                </p>
                <p className="text-xs text-zinc-500">
                  Duração média das gravações avaliadas
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="rounded-xl border border-zinc-800/90 shadcn-kpi-card p-5 space-y-2"
              >
                <div className="flex items-center justify-between gap-2 text-xs text-zinc-400">
                  <span>Latência SQL & REST API</span>
                  <Cpu className="h-4 w-4 text-zinc-400 shrink-0" />
                </div>
                <p className="text-3xl font-bold font-mono text-zinc-50">
                  {bench.apiSerializationLatencyMs} ms
                </p>
                <p className="text-xs font-mono text-zinc-500">
                  DB Query: {bench.dbQueryLatencyMs}ms • Audio:{" "}
                  {bench.audioStreamThroughputKbps} kbps
                </p>
              </motion.div>
            </div>

            {/* Category Adherence Benchmarks */}
            <div className="rounded-xl border border-zinc-800/90 bg-[#101013] p-5 sm:p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
                <div>
                  <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-zinc-400 shrink-0" />
                    <span>
                      Benchmark de Aderência por Categoria de Formulário
                    </span>
                  </h2>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Percentual de critérios atendidos em cada etapa da ligação
                    comparado à meta de 80%
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
                {bench.categoryBenchmarks.map((cat) => {
                  const adh = Number(cat.adherencePercentage);
                  const target = Number(cat.targetPercentage);
                  const aboveTarget = adh >= target;

                  return (
                    <div
                      key={cat.category}
                      className="p-4 rounded-xl border border-zinc-800 bg-[#0b0b0d] space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-zinc-100 truncate">
                          {cat.category}
                        </span>
                        <span className="font-mono text-xs font-bold text-zinc-100 whitespace-nowrap shrink-0">
                          {adh.toFixed(1)}%{" "}
                          <span className="text-[11px] font-normal text-zinc-500">
                            ({cat.checkedItemsCount}/{cat.totalItemsEvaluated}{" "}
                            itens)
                          </span>
                        </span>
                      </div>

                      <div className="h-2 w-full rounded-full bg-zinc-900 overflow-hidden border border-zinc-800">
                        <div
                          className={`h-full rounded-full ${
                            aboveTarget ? "bg-zinc-100" : "bg-zinc-500"
                          }`}
                          style={{ width: `${Math.min(100, adh)}%` }}
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-zinc-500">
                        <span>Meta Benchmark: {target.toFixed(0)}%</span>
                        <span
                          className={
                            aboveTarget ? "text-emerald-400" : "text-amber-400"
                          }
                        >
                          {aboveTarget
                            ? "Acima do Benchmark"
                            : "Oportunidade de Treinamento (RH)"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Analyst Benchmark Gap Table */}
            <div className="rounded-xl border border-zinc-800/90 bg-[#101013] overflow-hidden">
              <div className="p-5 sm:p-6 border-b border-zinc-800 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-zinc-100">
                    Benchmark Individual por Analista (Gap vs Meta 80%)
                  </h2>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Comparação direta de cada analista contra o índice de
                    referência da operação
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 font-mono text-zinc-500 whitespace-nowrap">
                      <th className="py-3.5 px-6">Analista</th>
                      <th className="py-3.5 px-4">Setor</th>
                      <th className="py-3.5 px-4 text-center">Avaliações</th>
                      <th className="py-3.5 px-4 text-center">
                        Conformidade (Sem Fatal)
                      </th>
                      <th className="py-3.5 px-4 text-right">Nota Média</th>
                      <th className="py-3.5 px-4 text-right">
                        Delta vs Benchmark (80%)
                      </th>
                      <th className="py-3.5 px-6 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/80">
                    {bench.analystBenchmarks.map((a) => {
                      const delta = Number(a.deltaFromTarget);
                      const isPositive = delta >= 0;
                      return (
                        <tr
                          key={a.analystId}
                          className="hover:bg-zinc-900/40 transition-colors whitespace-nowrap"
                        >
                          <td className="py-3.5 px-6 font-semibold text-zinc-100">
                            {a.analystName}
                          </td>
                          <td className="py-3.5 px-4 text-zinc-400">
                            {a.department}
                          </td>
                          <td className="py-3.5 px-4 text-center font-mono text-zinc-300">
                            {a.evaluatedCalls}
                          </td>
                          <td className="py-3.5 px-4 text-center font-mono text-zinc-300">
                            {Number(a.complianceRate).toFixed(1)}%
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-bold text-zinc-100">
                            {Number(a.averageScore).toFixed(1)}%
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap ${
                                isPositive
                                  ? "bg-zinc-100 text-zinc-950"
                                  : "bg-zinc-900 text-zinc-400 border border-zinc-800"
                              }`}
                            >
                              {isPositive ? (
                                <TrendingUp className="h-3 w-3 shrink-0" />
                              ) : (
                                <TrendingDown className="h-3 w-3 shrink-0" />
                              )}
                              {isPositive ? `+${delta}` : delta}%
                            </span>
                          </td>
                          <td className="py-3.5 px-6 text-right">
                            <Link
                              href={`/analysts/${a.analystId}`}
                              className="inline-flex items-center justify-center h-8 px-3 rounded-lg bg-zinc-100 text-zinc-950 font-semibold text-xs hover:bg-zinc-200 transition-colors whitespace-nowrap shrink-0"
                            >
                              Avaliar Analista
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
