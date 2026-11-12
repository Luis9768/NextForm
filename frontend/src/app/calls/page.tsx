"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  Eye,
  Headphones,
  Pencil,
  PhoneCall,
  Plus,
  Search,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { CallAudioPlayer } from "@/components/audio/CallAudioPlayer";
import { EditEvaluationScoreModal } from "@/components/evaluations/EditEvaluationScoreModal";
import { TablePagination } from "@/components/ui/TablePagination";
import { useAuth } from "@/context/AuthContext";
import { callsApi } from "@/lib/api";
import {
  formatDateTime,
  formatDuration,
  getEvaluationStatusBadge,
} from "@/lib/utils";
import { CallStatus } from "@/types";

export default function CallsListPage() {
  const { user, isGestor } = useAuth();
  const [statusFilter, setStatusFilter] = useState<CallStatus | "ALL">("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [playingCallId, setPlayingCallId] = useState<string | null>(null);
  const [editingEvaluationId, setEditingEvaluationId] = useState<string | null>(
    null
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const { data: calls = [], isLoading } = useQuery({
    queryKey: [
      "calls-list",
      user?.id,
      statusFilter === "ALL" ? undefined : statusFilter,
    ],
    queryFn: () =>
      callsApi.list({
        status: statusFilter === "ALL" ? undefined : statusFilter,
      }),
    enabled: !!user,
  });

  const filteredCalls = useMemo(() => {
    if (!searchTerm.trim()) return calls;
    const q = searchTerm.toLowerCase();
    return calls.filter(
      (call) =>
        call.externalCallId.toLowerCase().includes(q) ||
        call.customerIdentifier.toLowerCase().includes(q) ||
        call.analyst.name.toLowerCase().includes(q) ||
        call.analyst.email.toLowerCase().includes(q) ||
        (call.campaign && call.campaign.toLowerCase().includes(q)) ||
        (call.channel && call.channel.toLowerCase().includes(q))
    );
  }, [calls, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredCalls.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedCalls = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredCalls.slice(start, start + pageSize);
  }, [filteredCalls, safePage, pageSize]);

  const metrics = useMemo(() => {
    const total = calls.length;
    const pending = calls.filter((c) => c.status === "PENDENTE").length;
    const evaluated = calls.filter((c) => c.status === "AVALIADA").length;
    const avgDuration =
      total > 0
        ? Math.round(
            calls.reduce((acc, c) => acc + (c.durationSeconds || 0), 0) / total
          )
        : 0;
    return { total, pending, evaluated, avgDuration };
  }, [calls]);

  return (
    <AppShell>
      <div className="space-y-4 pb-14 w-full overflow-x-hidden">
        {/* Strip de Resumo Executivo */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="px-4 py-3.5 rounded-xl border border-zinc-800/80 bg-[#0e0e11] flex items-baseline justify-between">
            <span className="text-xs text-zinc-400">Total de Gravações</span>
            <span className="text-lg font-semibold font-mono text-zinc-100">
              {metrics.total}
            </span>
          </div>
          <div className="px-4 py-3.5 rounded-xl border border-zinc-800/80 bg-[#0e0e11] flex items-baseline justify-between">
            <span className="text-xs text-zinc-400">Pendentes</span>
            <span className="text-lg font-semibold font-mono text-amber-400">
              {metrics.pending}
            </span>
          </div>
          <div className="px-4 py-3.5 rounded-xl border border-zinc-800/80 bg-[#0e0e11] flex items-baseline justify-between">
            <span className="text-xs text-zinc-400">Avaliadas</span>
            <span className="text-lg font-semibold font-mono text-emerald-400">
              {metrics.evaluated}
            </span>
          </div>
          <div className="px-4 py-3.5 rounded-xl border border-zinc-800/80 bg-[#0e0e11] flex items-baseline justify-between">
            <span className="text-xs text-zinc-400">Duração Média</span>
            <span className="text-lg font-semibold font-mono text-zinc-100">
              {formatDuration(metrics.avgDuration)}
            </span>
          </div>
        </div>

        {/* Barra de Ferramentas Unificada */}
        <div className="p-3 rounded-xl border border-zinc-800/80 bg-[#0e0e11] flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
            <div className="inline-flex items-center p-0.5 rounded-lg bg-[#09090b] border border-zinc-800/80">
              {(
                [
                  { id: "ALL", label: "Todas" },
                  { id: "PENDENTE", label: "Pendentes" },
                  { id: "AVALIADA", label: "Avaliadas" },
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

            <div className="relative w-full sm:w-64">
              <Search className="h-3.5 w-3.5 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Buscar protocolo, telefone ou analista..."
                className="w-full h-8 pl-8 pr-3 rounded-md border border-zinc-800 bg-[#09090b] text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
              />
            </div>
          </div>

          {isGestor && (
            <Link
              href="/analysts"
              className="h-8 px-3.5 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Nova Ligação</span>
            </Link>
          )}
        </div>

        {/* Tabela de Gravações Padronizada em Grid (Alinhamento Vertical Estrito) */}
        <div className="rounded-xl border border-zinc-800/80 bg-[#0e0e11] divide-y divide-zinc-800/60 overflow-hidden">
          {/* Cabeçalho de Colunas (Desktop) */}
          <div className="hidden lg:grid lg:grid-cols-[176px_minmax(0,1.5fr)_minmax(0,1.25fr)_84px_138px_56px_248px] lg:items-center lg:gap-3 px-5 py-2.5 bg-[#09090b] text-[10px] font-mono uppercase tracking-wider text-zinc-500">
            <span>Código / ID</span>
            <span>Operador & Setor</span>
            <span>Telefone & Data</span>
            <span className="text-right">Duração</span>
            <span className="text-center">Status</span>
            <span className="text-right">Nota</span>
            <span className="text-right">Ações</span>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-xs text-zinc-500">
              Carregando ligações...
            </div>
          ) : filteredCalls.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <PhoneCall className="h-6 w-6 text-zinc-500 mx-auto" />
              <p className="text-xs text-zinc-400">
                Nenhuma gravação encontrada.
              </p>
            </div>
          ) : (
            paginatedCalls.map((call) => {
              const isEvaluated = call.status === "AVALIADA";
              const evalBadge = getEvaluationStatusBadge(call.evaluationStatus);
              const isPlaying = playingCallId === call.id;
              const sectorLabel = call.analyst.department || "Geral";
              const initials = (call.analyst.name || "OP")
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase())
                .join("");

              return (
                <div key={call.id} className="divide-y divide-zinc-800/50">
                  <div className="p-4 sm:px-5 sm:py-3 hover:bg-zinc-900/35 transition-colors flex flex-col lg:grid lg:grid-cols-[176px_minmax(0,1.5fr)_minmax(0,1.25fr)_84px_138px_56px_248px] lg:items-center gap-3">
                    {/* Coluna 1: Código / ID com Largura Fixa */}
                    <div className="min-w-0">
                      <span
                        title={`#${call.externalCallId}`}
                        className="inline-block max-w-full truncate px-2.5 py-1 rounded-md bg-[#141418] border border-zinc-800 font-mono text-[11px] font-semibold text-zinc-200"
                      >
                        #{call.externalCallId}
                      </span>
                    </div>

                    {/* Coluna 2: Operador (Avatar + Nome + Setor) */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-8 w-8 rounded-lg bg-[#15151a] border border-zinc-800 flex items-center justify-center text-[11px] font-mono font-semibold text-zinc-200 shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-zinc-100 truncate">
                          {call.analyst.name}
                        </p>
                        <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded bg-[#141418] border border-zinc-800/90 text-[10px] font-mono text-zinc-400 truncate max-w-full">
                          {sectorLabel}
                        </span>
                      </div>
                    </div>

                    {/* Coluna 3: Telefone & Data */}
                    <div className="min-w-0">
                      <p className="text-xs font-mono font-medium text-zinc-200 truncate">
                        Tel: {call.customerIdentifier}
                      </p>
                      <p className="text-[11px] font-mono text-zinc-500 truncate mt-0.5">
                        {formatDateTime(call.callDate)}
                      </p>
                    </div>

                    {/* Coluna 4: Duração */}
                    <div className="flex items-center justify-between lg:justify-end">
                      <span className="text-[10px] font-mono uppercase text-zinc-500 lg:hidden">
                        Duração
                      </span>
                      <span className="text-xs font-mono tabular-nums text-zinc-400">
                        {formatDuration(call.durationSeconds)}
                      </span>
                    </div>

                    {/* Coluna 5: Status Centralizado */}
                    <div className="flex items-center justify-between lg:justify-center">
                      <span className="text-[10px] font-mono uppercase text-zinc-500 lg:hidden">
                        Status
                      </span>
                      {isEvaluated ? (
                        <span
                          className={`inline-flex items-center justify-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] whitespace-nowrap ${evalBadge.className}`}
                        >
                          <CheckCircle2 className="h-3 w-3 shrink-0" />
                          <span>{evalBadge.label}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border border-zinc-800 bg-[#141418] text-zinc-300 whitespace-nowrap">
                          <Clock className="h-3 w-3 text-zinc-400 shrink-0" />
                          <span>Pendente</span>
                        </span>
                      )}
                    </div>

                    {/* Coluna 6: Nota Final (Slot fixo mesmo quando Pendente) */}
                    <div className="flex items-center justify-between lg:justify-end">
                      <span className="text-[10px] font-mono uppercase text-zinc-500 lg:hidden">
                        Nota
                      </span>
                      <span className="font-mono font-bold text-sm tabular-nums text-zinc-100">
                        {isEvaluated &&
                        call.finalScorePercentage !== null &&
                        call.finalScorePercentage !== undefined
                          ? `${Number(call.finalScorePercentage).toFixed(0)}%`
                          : "—"}
                      </span>
                    </div>

                    {/* Coluna 7: Botões de Ação */}
                    <div className="flex items-center justify-end gap-1.5 pt-2 lg:pt-0 border-t lg:border-t-0 border-zinc-800/50">
                      <button
                        type="button"
                        onClick={() =>
                          setPlayingCallId(isPlaying ? null : call.id)
                        }
                        className="h-8 px-2.5 rounded-md border border-zinc-800 bg-[#141418] hover:bg-zinc-800 text-xs font-medium text-zinc-200 inline-flex items-center gap-1.5 transition-colors"
                      >
                        <Headphones className="h-3.5 w-3.5" />
                        <span>{isPlaying ? "Ocultar" : "Ouvir"}</span>
                      </button>

                      {isEvaluated && call.evaluationId ? (
                        <>
                          {isGestor && (
                            <button
                              type="button"
                              onClick={() =>
                                setEditingEvaluationId(call.evaluationId!)
                              }
                              title="Editar nota da avaliação"
                              className="h-8 px-2.5 rounded-md border border-zinc-800 bg-[#141418] hover:bg-zinc-800 text-xs font-medium text-zinc-200 inline-flex items-center gap-1.5 transition-colors"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              <span>Editar</span>
                            </button>
                          )}
                          <Link
                            href={`/evaluations/${call.evaluationId}`}
                            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-xs font-semibold transition-colors"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Espelho</span>
                          </Link>
                        </>
                      ) : isGestor ? (
                        <Link
                          href={`/analysts/${call.analyst.id}?callId=${call.id}`}
                          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-xs font-semibold transition-colors"
                        >
                          <Headphones className="h-3.5 w-3.5" />
                          <span>Avaliar</span>
                        </Link>
                      ) : null}
                    </div>
                  </div>

                  {isPlaying && (
                    <div className="p-4 bg-[#09090b]">
                      <CallAudioPlayer
                        audioUrl={call.audioUrl}
                        externalCallId={call.externalCallId}
                        durationSeconds={call.durationSeconds}
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}

          <TablePagination
            currentPage={safePage}
            totalItems={filteredCalls.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
            itemLabel="ligações"
          />
        </div>
      </div>

      <EditEvaluationScoreModal
        evaluationId={editingEvaluationId}
        onClose={() => setEditingEvaluationId(null)}
      />
    </AppShell>
  );
}
