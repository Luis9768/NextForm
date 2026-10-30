"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  Eye,
  Headphones,
  PhoneCall,
  Plus,
  Search,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { CallAudioPlayer } from "@/components/audio/CallAudioPlayer";
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

  const filteredCalls = calls.filter((call) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      call.externalCallId.toLowerCase().includes(q) ||
      call.customerIdentifier.toLowerCase().includes(q) ||
      call.analyst.name.toLowerCase().includes(q) ||
      call.analyst.email.toLowerCase().includes(q) ||
      (call.campaign && call.campaign.toLowerCase().includes(q)) ||
      (call.channel && call.channel.toLowerCase().includes(q))
    );
  });

  return (
    <AppShell>
      <div className="space-y-6 pb-16">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              Central de Ligações Gravadas
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Todas as gravações vinculadas aos analistas para escuta e
              avaliação de qualidade.
            </p>
          </div>

          {isGestor && (
            <Link
              href="/analysts"
              className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-950 hover:opacity-90 text-xs font-semibold transition-opacity self-start"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Anexar Nova Ligação por Analista</span>
            </Link>
          )}
        </div>

        {/* Filters & Search Bar (Shadcn Neutral Dark) */}
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/90 bg-white dark:bg-[#101013] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-zinc-100 dark:bg-[#09090b] p-1 border border-zinc-200 dark:border-zinc-800/80 self-start">
            {(
              [
                { id: "ALL", label: "Todas as Ligações" },
                { id: "PENDENTE", label: "Pendentes de Avaliação" },
                { id: "AVALIADA", label: "Avaliadas" },
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

          <div className="relative w-full lg:w-80">
            <Search className="h-3.5 w-3.5 text-zinc-500 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar protocolo, telefone ou analista..."
              className="w-full h-9 pl-9 pr-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090b] text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
            />
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800/90 bg-white dark:bg-[#101013] overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-zinc-500">
              Carregando ligações...
            </div>
          ) : filteredCalls.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <PhoneCall className="h-7 w-7 text-zinc-500 mx-auto" />
              <p className="text-xs font-medium text-zinc-400">
                Nenhuma ligação encontrada para o filtro selecionado.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[840px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-mono uppercase text-zinc-500 whitespace-nowrap">
                    <th className="py-3.5 px-6">Ligação / Data</th>
                    <th className="py-3.5 px-4">Analista</th>
                    <th className="py-3.5 px-4">Cliente / Campanha</th>
                    <th className="py-3.5 px-4 text-center">Duração</th>
                    <th className="py-3.5 px-4 text-center">Status</th>
                    <th className="py-3.5 px-4 text-center">Nota Final</th>
                    <th className="py-3.5 px-6 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/80 text-xs">
                  {filteredCalls.map((call) => {
                    const isEvaluated = call.status === "AVALIADA";
                    const evalBadge = getEvaluationStatusBadge(
                      call.evaluationStatus
                    );
                    const isPlaying = playingCallId === call.id;

                    return (
                      <React.Fragment key={call.id}>
                        <tr className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40 transition-colors">
                          <td className="py-4 px-6">
                            <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                              #{call.externalCallId}
                            </span>
                            <p className="text-[11px] text-zinc-500 mt-0.5">
                              {formatDateTime(call.callDate)}
                            </p>
                          </td>

                          <td className="py-4 px-4">
                            <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                              {call.analyst.name}
                            </p>
                            <p className="text-[11px] text-zinc-500">
                              {call.analyst.email}
                            </p>
                          </td>

                          <td className="py-4 px-4">
                            <p className="font-mono text-zinc-800 dark:text-zinc-200">
                              {call.customerIdentifier}
                            </p>
                            <p className="text-[11px] text-zinc-500">
                              {call.channel} • {call.campaign}
                            </p>
                          </td>

                          <td className="py-4 px-4 text-center font-mono text-zinc-400">
                            {formatDuration(call.durationSeconds)}
                          </td>

                          <td className="py-4 px-4 text-center">
                            {isEvaluated ? (
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] ${evalBadge.className}`}
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                {evalBadge.label}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border border-zinc-700 bg-zinc-900 text-zinc-300">
                                <Clock className="h-3 w-3" />
                                Pendente
                              </span>
                            )}
                          </td>

                          <td className="py-4 px-4 text-center font-mono">
                            {isEvaluated &&
                            call.finalScorePercentage !== null &&
                            call.finalScorePercentage !== undefined ? (
                              <span className="font-bold text-sm text-zinc-100">
                                {Number(call.finalScorePercentage).toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-zinc-500">-</span>
                            )}
                          </td>

                          <td className="py-4 px-6 text-right">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setPlayingCallId(isPlaying ? null : call.id)
                                }
                                className="h-8 px-3 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-200 transition-colors"
                              >
                                {isPlaying ? "Ocultar Áudio" : "Ouvir"}
                              </button>

                              {isEvaluated && call.evaluationId ? (
                                <Link
                                  href={`/evaluations/${call.evaluationId}`}
                                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-800 text-xs font-medium text-zinc-200 transition-colors"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  <span>Ver Avaliação</span>
                                </Link>
                              ) : isGestor ? (
                                <Link
                                  href={`/calls/${call.id}/evaluate`}
                                  className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-950 hover:opacity-90 text-xs font-semibold transition-opacity"
                                >
                                  <Headphones className="h-3.5 w-3.5" />
                                  <span>Avaliar</span>
                                </Link>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                        {isPlaying && (
                          <tr className="bg-zinc-950/60">
                            <td colSpan={7} className="p-4">
                              <CallAudioPlayer
                                audioUrl={call.audioUrl}
                                externalCallId={call.externalCallId}
                                durationSeconds={call.durationSeconds}
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
