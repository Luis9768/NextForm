"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Eye,
  Headphones,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { CallAudioPlayer } from "@/components/audio/CallAudioPlayer";
import { TablePagination } from "@/components/ui/TablePagination";
import { useAuth } from "@/context/AuthContext";
import {
  directusApi,
  DirectusSyncResult,
  evaluationsApi,
  extractErrorMessage,
} from "@/lib/api";
import {
  formatDateTime,
  formatDuration,
  getEvaluationStatusBadge,
} from "@/lib/utils";
import { EvaluationStatus } from "@/types";

export default function EvaluationsListPage() {
  const { user, isGestor } = useAuth();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<EvaluationStatus | "ALL">(
    "ALL"
  );
  const [codeFilter, setCodeFilter] = useState("");
  const [analystNameFilter, setAnalystNameFilter] = useState("");
  const [sectorFilter, setSectorFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [playingEvalId, setPlayingEvalId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Modal de Sincronização / Pull com Directus
  const [isDirectusModalOpen, setIsDirectusModalOpen] = useState(false);
  const [directusBaseUrl, setDirectusBaseUrl] = useState("");
  const [directusApiToken, setDirectusApiToken] = useState("");
  const [directusCollection, setDirectusCollection] = useState("ALL");
  const [directusLimit, setDirectusLimit] = useState(0);
  const [singleCollection, setSingleCollection] = useState(
    "Monitoria_Tim_Aquisicao"
  );
  const [singleItemId, setSingleItemId] = useState("757");
  const [syncResult, setSyncResult] = useState<DirectusSyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

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

  const invalidateAfterSync = (result: DirectusSyncResult) => {
    setSyncError(null);
    setSyncResult(result);
    queryClient.invalidateQueries({ queryKey: ["evaluations-list"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    queryClient.invalidateQueries({ queryKey: ["calls-list"] });
    queryClient.invalidateQueries({ queryKey: ["users-list"] });
  };

  const pullApiMutation = useMutation({
    mutationFn: () =>
      directusApi.pullFromApi({
        baseUrl: directusBaseUrl || undefined,
        apiToken: directusApiToken || undefined,
        collection: directusCollection,
        limit: directusLimit,
      }),
    onSuccess: invalidateAfterSync,
    onError: (err) => setSyncError(extractErrorMessage(err)),
  });

  const pullSingleItemMutation = useMutation({
    mutationFn: () =>
      directusApi.pullSingleItem({
        collection: singleCollection,
        itemId: singleItemId.trim(),
        baseUrl: directusBaseUrl || undefined,
        apiToken: directusApiToken || undefined,
      }),
    onSuccess: invalidateAfterSync,
    onError: (err) => setSyncError(extractErrorMessage(err)),
  });

  const importSamplesMutation = useMutation({
    mutationFn: () => directusApi.importSamples(5),
    onSuccess: invalidateAfterSync,
    onError: (err) => setSyncError(extractErrorMessage(err)),
  });

  const filteredEvaluations = evaluations.filter((ev) => {
    if (statusFilter !== "ALL" && ev.status !== statusFilter) {
      return false;
    }
    return true;
  });

  const totalPages = Math.max(
    1,
    Math.ceil(filteredEvaluations.length / pageSize)
  );
  const safePage = Math.min(currentPage, totalPages);
  const paginatedEvaluations = filteredEvaluations.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  return (
    <AppShell>
      <div className="space-y-4 pb-14 w-full overflow-x-hidden">
        {/* Barra de Filtros Unificada */}
        <div className="p-3.5 rounded-xl border border-zinc-800/80 bg-[#0e0e11] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="inline-flex flex-wrap items-center gap-0.5 rounded-lg bg-[#09090b] p-0.5 border border-zinc-800/80">
              {(
                [
                  { id: "ALL", label: "Todas" },
                  { id: "APROVADO", label: "Aprovadas" },
                  { id: "REPROVADO", label: "Reprovadas" },
                  { id: "ZERADO_ERRO_GRAVE", label: "Falta Grave (0%)" },
                ] as const
              ).map((tab) => {
                const active = statusFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setStatusFilter(tab.id);
                      setCurrentPage(1);
                    }}
                    className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors ${
                      active
                        ? "bg-zinc-100 text-zinc-950 font-semibold"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
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
                  Limpar filtros
                </button>
              )}

              {isGestor && (
                <button
                  type="button"
                  onClick={() => {
                    setSyncError(null);
                    setIsDirectusModalOpen(true);
                  }}
                  className="h-8 px-3 rounded-md border border-zinc-700 bg-[#141418] hover:bg-zinc-800 text-xs font-medium text-zinc-100 inline-flex items-center gap-1.5 transition-colors"
                >
                  <Database className="h-3.5 w-3.5 text-zinc-300" />
                  <span>Sincronizar Directus</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={codeFilter}
                onChange={(e) => setCodeFilter(e.target.value)}
                placeholder="Código / Protocolo..."
                className="w-full h-8 pl-8 pr-3 rounded-md border border-zinc-800 bg-[#09090b] text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
              />
            </div>

            {isGestor && (
              <div>
                <input
                  type="text"
                  value={analystNameFilter}
                  onChange={(e) => setAnalystNameFilter(e.target.value)}
                  placeholder="Nome do Analista..."
                  className="w-full h-8 px-3 rounded-md border border-zinc-800 bg-[#09090b] text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
                />
              </div>
            )}

            {isGestor && (
              <div>
                <select
                  value={sectorFilter}
                  onChange={(e) => setSectorFilter(e.target.value)}
                  className="w-full h-8 px-2.5 rounded-md border border-zinc-800 bg-[#09090b] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
                >
                  <option value="">Todos os Setores</option>
                  <option value="SAC">SAC</option>
                  <option value="Cobrança & Retenção">
                    Cobrança & Retenção
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
                className="w-full h-8 px-2.5 rounded-md border border-zinc-800 bg-[#09090b] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
              />
            </div>

            <div>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                title="Data Final"
                className="w-full h-8 px-2.5 rounded-md border border-zinc-800 bg-[#09090b] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
              />
            </div>
          </div>
        </div>

        {/* Tabela de Avaliações Alinhada em Grid (Zero Desalinhamento entre Linhas) */}
        <div className="rounded-xl border border-zinc-800/80 bg-[#0e0e11] divide-y divide-zinc-800/60 overflow-hidden">
          {/* Cabeçalho de Colunas (Desktop) */}
          <div className="hidden lg:grid lg:grid-cols-[176px_minmax(0,1.45fr)_minmax(0,1.25fr)_96px_138px_56px_168px] lg:items-center lg:gap-3 px-5 py-2.5 bg-[#09090b] text-[10px] font-mono uppercase tracking-wider text-zinc-500">
            <span>Código / ID</span>
            <span>Operador & Setor</span>
            <span>Matriz & Data</span>
            <span className="text-right">Pontos</span>
            <span className="text-center">Status</span>
            <span className="text-right">Nota</span>
            <span className="text-right">Ações</span>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-xs text-zinc-500">
              Carregando avaliações...
            </div>
          ) : filteredEvaluations.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <ClipboardCheck className="h-6 w-6 text-zinc-500 mx-auto" />
              <p className="text-xs text-zinc-400">
                Nenhuma avaliação encontrada.
              </p>
            </div>
          ) : (
            paginatedEvaluations.map((ev) => {
              const badge = getEvaluationStatusBadge(ev.status);
              const isPlaying = playingEvalId === ev.id;
              const sectorLabel =
                ev.analystSectorSnapshot || ev.analyst.department || "Geral";
              const initials = (ev.analyst.name || "OP")
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase())
                .join("");

              return (
                <div key={ev.id} className="divide-y divide-zinc-800/50">
                  <div className="p-4 sm:px-5 sm:py-3 hover:bg-zinc-900/35 transition-colors flex flex-col lg:grid lg:grid-cols-[176px_minmax(0,1.45fr)_minmax(0,1.25fr)_96px_138px_56px_168px] lg:items-center gap-3">
                    {/* Coluna 1: Código / Protocolo com Largura Fixa */}
                    <div className="min-w-0">
                      <span
                        title={`#${ev.callRecord.externalCallId}`}
                        className="inline-block max-w-full truncate px-2.5 py-1 rounded-md bg-[#141418] border border-zinc-800 font-mono text-[11px] font-semibold text-zinc-200"
                      >
                        #{ev.callRecord.externalCallId}
                      </span>
                    </div>

                    {/* Coluna 2: Operador (Avatar + Nome + Setor Alinhado) */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-8 w-8 rounded-lg bg-[#15151a] border border-zinc-800 flex items-center justify-center text-[11px] font-mono font-semibold text-zinc-200 shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-zinc-100 truncate">
                          {ev.analyst.name}
                        </p>
                        <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded bg-[#141418] border border-zinc-800/90 text-[10px] font-mono text-zinc-400 truncate max-w-full">
                          {sectorLabel}
                        </span>
                      </div>
                    </div>

                    {/* Coluna 3: Matriz & Data/Duração */}
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-zinc-200 truncate">
                        {ev.formNameSnapshot}
                      </p>
                      <p className="text-[11px] font-mono text-zinc-500 truncate mt-0.5">
                        {formatDateTime(ev.evaluatedAt)} •{" "}
                        {formatDuration(ev.callRecord.durationSeconds)}
                      </p>
                    </div>

                    {/* Coluna 4: Pontos */}
                    <div className="flex items-center justify-between lg:justify-end">
                      <span className="text-[10px] font-mono uppercase text-zinc-500 lg:hidden">
                        Pontos
                      </span>
                      <span className="text-xs font-mono text-zinc-400">
                        {ev.obtainedPoints}/{ev.maxPossiblePoints} pts
                      </span>
                    </div>

                    {/* Coluna 5: Status Centralizado */}
                    <div className="flex items-center justify-between lg:justify-center">
                      <span className="text-[10px] font-mono uppercase text-zinc-500 lg:hidden">
                        Status
                      </span>
                      <span
                        className={`inline-flex items-center justify-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] whitespace-nowrap ${badge.className}`}
                      >
                        {ev.fatalErrorTriggered && (
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                        )}
                        <span>{badge.label}</span>
                      </span>
                    </div>

                    {/* Coluna 6: Nota Final */}
                    <div className="flex items-center justify-between lg:justify-end">
                      <span className="text-[10px] font-mono uppercase text-zinc-500 lg:hidden">
                        Nota Final
                      </span>
                      <span className="text-sm font-bold font-mono text-zinc-100">
                        {Number(ev.finalScorePercentage).toFixed(0)}%
                      </span>
                    </div>

                    {/* Coluna 7: Botões de Ação */}
                    <div className="flex items-center justify-end gap-1.5 pt-2 lg:pt-0 border-t lg:border-t-0 border-zinc-800/50">
                      <button
                        type="button"
                        onClick={() =>
                          setPlayingEvalId(isPlaying ? null : ev.id)
                        }
                        className="h-8 px-2.5 rounded-md border border-zinc-800 bg-[#141418] hover:bg-zinc-800 text-xs font-medium text-zinc-200 inline-flex items-center gap-1.5 transition-colors"
                      >
                        <Headphones className="h-3.5 w-3.5" />
                        <span>{isPlaying ? "Ocultar" : "Ouvir"}</span>
                      </button>

                      <Link
                        href={`/evaluations/${ev.id}`}
                        className="h-8 px-2.5 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>Espelho</span>
                      </Link>
                    </div>
                  </div>

                  {isPlaying && (
                    <div className="p-4 bg-[#09090b]">
                      <CallAudioPlayer
                        audioUrl={ev.callRecord.audioUrl}
                        externalCallId={ev.callRecord.externalCallId}
                        durationSeconds={ev.callRecord.durationSeconds}
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}

          <TablePagination
            currentPage={safePage}
            totalItems={filteredEvaluations.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
            itemLabel="avaliações"
          />
        </div>

        {/* Popup de Sincronização / Pull da API do Directus */}
        <AnimatePresence>
          {isGestor && isDirectusModalOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={() => setIsDirectusModalOpen(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 10 }}
                transition={{ duration: 0.18 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-lg rounded-xl border border-zinc-800 bg-[#0e0e11] p-5 space-y-4 shadow-2xl max-h-[88vh] overflow-y-auto overflow-x-hidden"
              >
                <div className="flex items-center justify-between gap-3 border-b border-zinc-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-zinc-300" />
                    <h2 className="text-sm font-semibold text-zinc-100">
                      Sincronizar Avaliações do Directus
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsDirectusModalOpen(false)}
                    className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {syncError && (
                  <div className="p-3 rounded-lg border border-red-900/60 bg-red-950/30 text-xs text-red-200">
                    {syncError}
                  </div>
                )}

                {syncResult && (
                  <div className="p-3.5 rounded-lg border border-emerald-800/60 bg-emerald-950/25 space-y-1.5 text-xs">
                    <div className="flex items-center gap-1.5 text-emerald-300 font-semibold">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span>
                        Sincronização concluída: {syncResult.importedCount}{" "}
                        importadas • {syncResult.skippedDuplicates} duplicadas
                        ignoradas
                      </span>
                    </div>
                    <p className="text-[11px] font-mono text-zinc-400">
                      Coleções: {syncResult.processedCollections.join(", ")}
                    </p>
                  </div>
                )}

                {/* Opção 1: Puxar da API REST do Directus */}
                <div className="space-y-3 p-3.5 rounded-lg border border-zinc-800/80 bg-[#09090b]">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 block">
                    1. Puxar via API REST do Directus (/items/&#123;collection&#125;)
                  </span>

                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">
                      URL Base do Directus (opcional se configurada no .env)
                    </label>
                    <input
                      type="url"
                      value={directusBaseUrl}
                      onChange={(e) => setDirectusBaseUrl(e.target.value)}
                      placeholder="Usa DIRECTUS_BASE_URL do servidor por padrão"
                      className="w-full h-9 px-3 rounded-md border border-zinc-800 bg-[#121215] text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">
                      Static Bearer Token (API Key do Directus)
                    </label>
                    <input
                      type="password"
                      value={directusApiToken}
                      onChange={(e) => setDirectusApiToken(e.target.value)}
                      placeholder="Bearer token com permissão de leitura..."
                      className="w-full h-9 px-3 rounded-md border border-zinc-800 bg-[#121215] text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-600"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">
                        Collection
                      </label>
                      <select
                        value={directusCollection}
                        onChange={(e) => setDirectusCollection(e.target.value)}
                        className="w-full h-9 px-2.5 rounded-md border border-zinc-800 bg-[#121215] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
                      >
                        <option value="ALL">Todas as 3 Coleções</option>
                        <option value="Monitoria_SAC">Monitoria_SAC</option>
                        <option value="Monitoria_Retencao">
                          Monitoria_Retencao
                        </option>
                        <option value="Monitoria_Tim_Aquisicao">
                          Monitoria_Tim_Aquisicao
                        </option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">
                        Limite (0 = Puxar Todas)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={directusLimit}
                        onChange={(e) =>
                          setDirectusLimit(Number(e.target.value) || 0)
                        }
                        className="w-full h-9 px-3 rounded-md border border-zinc-800 bg-[#121215] text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-600"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={pullApiMutation.isPending}
                    onClick={() => pullApiMutation.mutate()}
                    className="w-full h-9 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${
                        pullApiMutation.isPending ? "animate-spin" : ""
                      }`}
                    />
                    <span>
                      {pullApiMutation.isPending
                        ? "Consultando Directus..."
                        : "Puxar da API do Directus"}
                    </span>
                  </button>
                </div>

                {/* Opção 2: Puxar Item Específico por ID (?fields=*.*) */}
                <div className="space-y-2.5 p-3.5 rounded-lg border border-zinc-800/80 bg-[#09090b]">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 block">
                    2. Puxar Avaliação por ID (/items/&#123;collection&#125;/&#123;id&#125;?fields=*.*)
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_110px_auto] gap-2">
                    <select
                      value={singleCollection}
                      onChange={(e) => setSingleCollection(e.target.value)}
                      className="h-9 px-2.5 rounded-md border border-zinc-800 bg-[#121215] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
                    >
                      <option value="Monitoria_Tim_Aquisicao">
                        Monitoria_Tim_Aquisicao
                      </option>
                      <option value="Monitoria_SAC">Monitoria_SAC</option>
                      <option value="Monitoria_Retencao">
                        Monitoria_Retencao
                      </option>
                    </select>

                    <input
                      type="text"
                      value={singleItemId}
                      onChange={(e) => setSingleItemId(e.target.value)}
                      placeholder="ID (ex: 757)"
                      className="h-9 px-3 rounded-md border border-zinc-800 bg-[#121215] text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-600"
                    />

                    <button
                      type="button"
                      disabled={
                        !singleItemId.trim() || pullSingleItemMutation.isPending
                      }
                      onClick={() => pullSingleItemMutation.mutate()}
                      className="h-9 px-3.5 rounded-md border border-zinc-700 bg-[#141418] hover:bg-zinc-800 text-xs font-semibold text-zinc-100 shrink-0 disabled:opacity-50"
                    >
                      {pullSingleItemMutation.isPending
                        ? "Buscando..."
                        : "Puxar ID"}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppShell>
  );
}
