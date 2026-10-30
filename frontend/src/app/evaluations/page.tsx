"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ClipboardCheck,
  Eye,
  Headphones,
  PhoneCall,
  Search,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { CallAudioPlayer } from "@/components/audio/CallAudioPlayer";
import { useAuth } from "@/context/AuthContext";
import { evaluationsApi } from "@/lib/api";
import {
  formatDateTime,
  formatDuration,
  getEvaluationStatusBadge,
} from "@/lib/utils";
import { EvaluationStatus } from "@/types";

export default function EvaluationsListPage() {
  const { user, isGestor } = useAuth();
  const [statusFilter, setStatusFilter] = useState<EvaluationStatus | "ALL">(
    "ALL"
  );
  const [codeFilter, setCodeFilter] = useState("");
  const [analystNameFilter, setAnalystNameFilter] = useState("");
  const [sectorFilter, setSectorFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [playingEvalId, setPlayingEvalId] = useState<string | null>(null);

  const { data: evaluations = [], isLoading } = useQuery({
    queryKey: [
      "evaluations-list",
      user?.id,
      codeFilter,
      analystNameFilter,
      sectorFilter,
      startDate,
      endDate,
    ],
    queryFn: () =>
      evaluationsApi.list({
        code: codeFilter || undefined,
        analystName: analystNameFilter || undefined,
        sector: sectorFilter || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
    enabled: !!user,
  });

  const filteredEvaluations = evaluations.filter((ev) => {
    if (statusFilter !== "ALL" && ev.status !== statusFilter) {
      return false;
    }
    return true;
  });

  return (
    <AppShell>
      <div className="space-y-6 pb-16">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              {isGestor
                ? "Avaliações de Ligações da Equipe"
                : "Minhas Avaliações e Gravações Vinculadas"}
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              {isGestor
                ? "Cada avaliação está vinculada à sua respectiva gravação de ligação, snapshot de critérios, pesos e nota final."
                : "Consulte suas avaliações, ouça a gravação da ligação vinculada a cada nota e veja os feedbacks da gestão."}
            </p>
          </div>
        </div>

        {/* Filter Bar Avançada - Central de Avaliações */}
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/90 bg-white dark:bg-[#101013] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-zinc-100 dark:bg-[#09090b] p-1 border border-zinc-200 dark:border-zinc-800/80">
              {(
                [
                  { id: "ALL", label: "Todas" },
                  { id: "APROVADO", label: "Aprovadas" },
                  { id: "REPROVADO", label: "Atenção / Reprovadas" },
                  { id: "ZERADO_ERRO_GRAVE", label: "Zeradas (Erro Grave)" },
                ] as const
              ).map((tab) => {
                const active = statusFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      active
                        ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-950 font-semibold"
                        : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {(codeFilter ||
              analystNameFilter ||
              sectorFilter ||
              startDate ||
              endDate) && (
              <button
                type="button"
                onClick={() => {
                  setCodeFilter("");
                  setAnalystNameFilter("");
                  setSectorFilter("");
                  setStartDate("");
                  setEndDate("");
                }}
                className="text-xs font-mono text-zinc-400 hover:text-zinc-100"
              >
                Limpar filtros avançados
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={codeFilter}
                onChange={(e) => setCodeFilter(e.target.value)}
                placeholder="Código / ID da Avaliação..."
                className="w-full h-9 pl-8 pr-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090b] text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
              />
            </div>

            {isGestor && (
              <div>
                <input
                  type="text"
                  value={analystNameFilter}
                  onChange={(e) => setAnalystNameFilter(e.target.value)}
                  placeholder="Nome do Analista..."
                  className="w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090b] text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
                />
              </div>
            )}

            {isGestor && (
              <div>
                <select
                  value={sectorFilter}
                  onChange={(e) => setSectorFilter(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090b] text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-600"
                >
                  <option value="">Todos os Setores Permitidos</option>
                  <option value="SAC">SAC</option>
                  <option value="Cobrança & Retenção">
                    Cobrança & Retenção
                  </option>
                  <option value="Suporte N1">Suporte N1</option>
                  <option value="Retenção & Ouvidoria">
                    Retenção & Ouvidoria
                  </option>
                  <option value="Aquisição">Aquisição</option>
                </select>
              </div>
            )}

            <div>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                title="Data Inicial"
                className="w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090b] text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-600"
              />
            </div>

            <div>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                title="Data Final"
                className="w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090b] text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-600"
              />
            </div>
          </div>
        </div>

        {/* Evaluations List with Linked Call Info & Inline Audio Player */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800/90 bg-white dark:bg-[#101013] overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-zinc-500">
              Carregando avaliações...
            </div>
          ) : filteredEvaluations.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <ClipboardCheck className="h-7 w-7 text-zinc-500 mx-auto" />
              <p className="text-xs font-medium text-zinc-400">
                Nenhuma avaliação encontrada para os filtros selecionados.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-mono uppercase text-zinc-500 whitespace-nowrap">
                    <th className="py-3.5 px-6">Ligação Vinculada</th>
                    <th className="py-3.5 px-4">Analista Avaliado</th>
                    <th className="py-3.5 px-4">Formulário (Snapshot)</th>
                    <th className="py-3.5 px-4 text-center">Pontos (Pesos)</th>
                    <th className="py-3.5 px-4 text-center">Status</th>
                    <th className="py-3.5 px-4 text-center">Nota Final</th>
                    <th className="py-3.5 px-6 text-right">Áudio & Espelho</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/80 text-xs">
                  {filteredEvaluations.map((ev) => {
                    const badge = getEvaluationStatusBadge(ev.status);
                    const isPlaying = playingEvalId === ev.id;

                    return (
                      <React.Fragment key={ev.id}>
                        <tr className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40 transition-colors">
                          <td className="py-4 px-6 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <PhoneCall className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                              <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                                #{ev.callRecord.externalCallId}
                              </span>
                            </div>
                            <p className="text-[11px] text-zinc-500 mt-0.5 font-mono">
                              {ev.callRecord.customerIdentifier} •{" "}
                              {formatDuration(ev.callRecord.durationSeconds)}
                            </p>
                            <p className="text-[11px] text-zinc-500">
                              {formatDateTime(ev.evaluatedAt)}
                            </p>
                          </td>

                          <td className="py-4 px-4 whitespace-nowrap">
                            <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                              {ev.analyst.name}
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-300">
                                {ev.analystSectorSnapshot ||
                                  ev.analyst.department ||
                                  "Geral"}
                              </span>
                              <span className="text-[11px] text-zinc-500">
                                {ev.analyst.email}
                              </span>
                            </div>
                          </td>

                          <td className="py-4 px-4">
                            <p className="font-medium text-zinc-800 dark:text-zinc-200 max-w-[240px] truncate">
                              {ev.formNameSnapshot}
                            </p>
                            <p className="text-[11px] text-zinc-500 whitespace-nowrap">
                              v{ev.formVersionSnapshot} • Avaliador:{" "}
                              {ev.evaluator.name}
                            </p>
                          </td>

                          <td className="py-4 px-4 text-center font-mono font-semibold text-zinc-300 whitespace-nowrap">
                            {ev.obtainedPoints} / {ev.maxPossiblePoints} pts
                          </td>

                          <td className="py-4 px-4 text-center whitespace-nowrap">
                            <div className="flex flex-col items-center gap-1">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] whitespace-nowrap ${badge.className}`}
                              >
                                {badge.label}
                              </span>
                              {ev.fatalErrorTriggered && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-400 whitespace-nowrap">
                                  <AlertTriangle className="h-3 w-3 shrink-0" />
                                  Erro Grave
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-4 px-4 text-center font-mono whitespace-nowrap">
                            <span className="text-sm font-bold text-zinc-100">
                              {Number(ev.finalScorePercentage).toFixed(1)}%
                            </span>
                          </td>

                          <td className="py-4 px-6 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setPlayingEvalId(isPlaying ? null : ev.id)
                                }
                                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-200 transition-colors whitespace-nowrap shrink-0"
                              >
                                <Headphones className="h-3.5 w-3.5 shrink-0" />
                                <span>
                                  {isPlaying
                                    ? "Ocultar Áudio"
                                    : "Ouvir Ligação"}
                                </span>
                              </button>

                              <Link
                                href={`/evaluations/${ev.id}`}
                                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-950 hover:opacity-90 text-xs font-semibold transition-opacity whitespace-nowrap shrink-0"
                              >
                                <Eye className="h-3.5 w-3.5 shrink-0" />
                                <span>Ver Espelho</span>
                              </Link>
                            </div>
                          </td>
                        </tr>

                        {isPlaying && (
                          <tr className="bg-zinc-950/60">
                            <td colSpan={7} className="p-4">
                              <CallAudioPlayer
                                audioUrl={ev.callRecord.audioUrl}
                                externalCallId={ev.callRecord.externalCallId}
                                durationSeconds={ev.callRecord.durationSeconds}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
