"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Box,
  Code2,
  Columns3,
  Download,
  ExternalLink,
  Headphones,
  Search,
  Table2,
  X,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { CallAudioPlayer } from "@/components/audio/CallAudioPlayer";
import { DirectusDataModelView } from "@/components/studio/DirectusDataModelView";
import { DirectusFlowsCanvasView } from "@/components/studio/DirectusFlowsCanvasView";
import {
  DirectusAdminModulesView,
  DirectusAdminSectionKey,
} from "@/components/studio/DirectusAdminModulesView";
import { useAuth } from "@/context/AuthContext";
import {
  callsApi,
  evaluationsApi,
  formsApi,
  studioApi,
} from "@/lib/api";
import {
  formatDateTime,
  formatDuration,
  getEvaluationStatusBadge,
} from "@/lib/utils";
import { CallRecord, FormTemplate } from "@/types";

export type DirectusStudioSection =
  | "data-model"
  | "flows"
  | "user-roles"
  | "access-policies"
  | "settings"
  | "appearance"
  | "bookmarks"
  | "translations"
  | "marketplace"
  | "extensions"
  | "report-bug"
  | "request-feature"
  | "content";

type ActiveCollectionKey =
  | "call_records"
  | "evaluations"
  | "evaluation_form_templates";
type ContentLayoutMode = "table" | "kanban" | "activity";

export function DirectusStudioWorkspace({
  defaultSection = "data-model",
}: {
  defaultSection?: DirectusStudioSection;
}) {
  const { user, isGestor } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const sectionParam = searchParams.get(
    "section"
  ) as DirectusStudioSection | null;
  const activeSection: DirectusStudioSection = sectionParam || defaultSection;

  const [selectedCollection, setSelectedCollection] =
    useState<ActiveCollectionKey>("call_records");
  const [contentLayout, setContentLayout] =
    useState<ContentLayoutMode>("table");
  const [searchQuery, setSearchQuery] = useState("");
  const [drawerItem, setDrawerItem] = useState<{
    title: string;
    subtitle: string;
    raw: unknown;
    callRecord?: CallRecord;
  } | null>(null);

  useEffect(() => {
    if (sectionParam === "user-roles") {
      router.replace("/users");
      return;
    }
    const layoutParam = searchParams.get("layout");
    if (
      layoutParam === "kanban" ||
      layoutParam === "table" ||
      layoutParam === "activity"
    ) {
      setContentLayout(layoutParam);
    }
  }, [searchParams]);

  const { data: collections = [] } = useQuery({
    queryKey: ["studio-collections", user?.id],
    queryFn: studioApi.listCollections,
    enabled: !!user && isGestor,
  });

  const { data: activities = [] } = useQuery({
    queryKey: ["studio-activity", user?.id],
    queryFn: studioApi.listActivity,
    enabled: !!user && isGestor,
  });

  const { data: calls = [] } = useQuery({
    queryKey: ["calls-list", user?.id],
    queryFn: () => callsApi.list(),
    enabled: !!user && isGestor,
  });

  const { data: evaluations = [] } = useQuery({
    queryKey: ["evaluations-list", user?.id],
    queryFn: () => evaluationsApi.list(),
    enabled: !!user && isGestor,
  });

  const { data: forms = [] } = useQuery({
    queryKey: ["forms-all"],
    queryFn: () => formsApi.list(false),
    enabled: !!user && isGestor,
  });

  const filteredCalls = useMemo(() => {
    if (!searchQuery.trim()) return calls;
    const q = searchQuery.toLowerCase();
    return calls.filter(
      (c) =>
        c.externalCallId.toLowerCase().includes(q) ||
        c.analyst.name.toLowerCase().includes(q) ||
        c.customerIdentifier.toLowerCase().includes(q)
    );
  }, [calls, searchQuery]);

  const filteredEvaluations = useMemo(() => {
    if (!searchQuery.trim()) return evaluations;
    const q = searchQuery.toLowerCase();
    return evaluations.filter(
      (e) =>
        e.callRecord.externalCallId.toLowerCase().includes(q) ||
        e.analyst.name.toLowerCase().includes(q) ||
        e.formNameSnapshot.toLowerCase().includes(q)
    );
  }, [evaluations, searchQuery]);

  const filteredForms = useMemo(() => {
    if (!searchQuery.trim()) return forms;
    const q = searchQuery.toLowerCase();
    return forms.filter((f) => f.name.toLowerCase().includes(q));
  }, [forms, searchQuery]);

  const exportCollectionJson = () => {
    const payload =
      selectedCollection === "call_records"
        ? filteredCalls
        : selectedCollection === "evaluations"
        ? filteredEvaluations
        : filteredForms;

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedCollection}-export.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isGestor) {
    return (
      <div className="p-6 rounded-xl border border-zinc-800 bg-[#101013] text-zinc-300 text-sm">
        Acesso restrito: Este módulo é exclusivo para a gestão (
        <strong>ROLE_GESTOR</strong>). Analistas possuem acesso apenas ao seu
        próprio Dashboard e às suas Avaliações.
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {activeSection === "data-model" && (
        <DirectusDataModelView
          collections={collections}
          onInspectCollectionData={(colKey) => {
            setSelectedCollection(colKey as ActiveCollectionKey);
            router.push("/studio?section=content");
          }}
        />
      )}

      {activeSection === "flows" && <DirectusFlowsCanvasView />}

      {activeSection !== "data-model" &&
        activeSection !== "flows" &&
        activeSection !== "content" && (
          <DirectusAdminModulesView
            section={activeSection as DirectusAdminSectionKey}
          />
        )}

      {/* EXPLORADOR DE DADOS (Tabela / Kanban / Trilha de Auditoria) */}
      {activeSection === "content" && (
        <div className="space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
            <div>
              <p className="text-xs font-mono text-zinc-500">
                Monitoria & Conteúdo / {selectedCollection}
              </p>
              <h1 className="text-lg font-bold text-zinc-100 flex items-center gap-2 mt-0.5">
                <Box className="h-4 w-4 text-zinc-400" />
                <span>Explorador de Dados ({selectedCollection})</span>
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center rounded-xl bg-zinc-900 p-1 border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setContentLayout("table")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
                    contentLayout === "table"
                      ? "bg-zinc-100 text-zinc-950 font-semibold"
                      : "text-zinc-400 hover:text-zinc-100"
                  }`}
                >
                  <Table2 className="h-3.5 w-3.5" />
                  <span>Tabela</span>
                </button>
                <button
                  type="button"
                  onClick={() => setContentLayout("kanban")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
                    contentLayout === "kanban"
                      ? "bg-zinc-100 text-zinc-950 font-semibold"
                      : "text-zinc-400 hover:text-zinc-100"
                  }`}
                >
                  <Columns3 className="h-3.5 w-3.5" />
                  <span>Kanban</span>
                </button>
                <button
                  type="button"
                  onClick={() => setContentLayout("activity")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
                    contentLayout === "activity"
                      ? "bg-zinc-100 text-zinc-950 font-semibold"
                      : "text-zinc-400 hover:text-zinc-100"
                  }`}
                >
                  <Activity className="h-3.5 w-3.5" />
                  <span>Trilha de Auditoria</span>
                </button>
              </div>

              <button
                type="button"
                onClick={exportCollectionJson}
                className="h-9 px-3 rounded-xl border border-zinc-800 bg-[#101013] hover:bg-zinc-900 text-xs text-zinc-200 inline-flex items-center gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Exportar JSON</span>
              </button>
            </div>
          </div>

          {/* Abas de Coleções + Busca */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3.5 rounded-xl border border-zinc-800 bg-[#101013]">
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  {
                    key: "call_records",
                    label: "Gravações (call_records)",
                    count: calls.length,
                  },
                  {
                    key: "evaluations",
                    label: "Avaliações (evaluations)",
                    count: evaluations.length,
                  },
                  {
                    key: "evaluation_form_templates",
                    label: "Matrizes (form_templates)",
                    count: forms.length,
                  },
                ] as const
              ).map((col) => (
                <button
                  key={col.key}
                  type="button"
                  onClick={() => setSelectedCollection(col.key)}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-medium border ${
                    selectedCollection === col.key
                      ? "bg-zinc-100 text-zinc-950 border-zinc-100 font-semibold"
                      : "bg-[#0b0b0d] text-zinc-400 border-zinc-800 hover:text-zinc-100"
                  }`}
                >
                  <span>{col.label}</span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] bg-black/20">
                    {col.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="relative flex-1 max-w-xs">
              <Search className="h-3.5 w-3.5 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Filtrar em ${selectedCollection}...`}
                className="w-full h-8 pl-8 pr-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs text-zinc-100"
              />
            </div>
          </div>

          {contentLayout === "table" && (
            <div className="rounded-xl border border-zinc-800 bg-[#101013] overflow-hidden">
              {selectedCollection === "call_records" && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[740px] text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 font-mono text-zinc-500 bg-[#0b0b0d]">
                        <th className="py-3 px-4">external_call_id</th>
                        <th className="py-3 px-4">analyst</th>
                        <th className="py-3 px-4">customer_phone</th>
                        <th className="py-3 px-4 text-center">duration</th>
                        <th className="py-3 px-4 text-center">status</th>
                        <th className="py-3 px-4 text-right">inspector</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/80">
                      {filteredCalls.map((call) => {
                        const badge = getEvaluationStatusBadge(
                          call.evaluationStatus
                        );
                        return (
                          <tr
                            key={call.id}
                            className="hover:bg-zinc-900/40 transition-colors"
                          >
                            <td className="py-3 px-4 font-mono font-bold text-zinc-100">
                              {call.externalCallId}
                            </td>
                            <td className="py-3 px-4 text-zinc-200">
                              {call.analyst.name}
                            </td>
                            <td className="py-3 px-4 font-mono text-zinc-400">
                              {call.customerIdentifier}
                            </td>
                            <td className="py-3 px-4 text-center font-mono text-zinc-400">
                              {formatDuration(call.durationSeconds)}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] ${badge.className}`}
                              >
                                {call.status === "AVALIADA"
                                  ? badge.label
                                  : "PENDENTE"}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDrawerItem({
                                      title: `call_records / ${call.externalCallId}`,
                                      subtitle: `Analista: ${call.analyst.name}`,
                                      raw: call,
                                      callRecord: call,
                                    })
                                  }
                                  className="px-2.5 py-1 rounded border border-zinc-700 hover:bg-zinc-800 text-xs font-mono text-zinc-300 inline-flex items-center gap-1"
                                >
                                  <Code2 className="h-3 w-3" />
                                  <span>Inspect</span>
                                </button>
                                {call.status === "PENDENTE" && (
                                  <Link
                                    href={`/calls/${call.id}/evaluate`}
                                    className="px-2.5 py-1 rounded bg-zinc-100 text-zinc-950 font-semibold text-xs inline-flex items-center gap-1"
                                  >
                                    <Headphones className="h-3 w-3" />
                                    <span>Avaliar</span>
                                  </Link>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedCollection === "evaluations" && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[740px] text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 font-mono text-zinc-500 bg-[#0b0b0d]">
                        <th className="py-3 px-4">call_id</th>
                        <th className="py-3 px-4">analyst</th>
                        <th className="py-3 px-4">form_snapshot</th>
                        <th className="py-3 px-4 text-center">points</th>
                        <th className="py-3 px-4 text-right">final_score</th>
                        <th className="py-3 px-4 text-right">inspector</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/80">
                      {filteredEvaluations.map((ev) => (
                        <tr key={ev.id} className="hover:bg-zinc-900/40">
                          <td className="py-3 px-4 font-mono font-bold text-zinc-100">
                            #{ev.callRecord.externalCallId}
                          </td>
                          <td className="py-3 px-4 text-zinc-200">
                            {ev.analyst.name}
                          </td>
                          <td className="py-3 px-4 text-zinc-400">
                            {ev.formNameSnapshot} (v{ev.formVersionSnapshot})
                          </td>
                          <td className="py-3 px-4 text-center font-mono text-zinc-300">
                            {ev.obtainedPoints}/{ev.maxPossiblePoints}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-zinc-100">
                            {Number(ev.finalScorePercentage).toFixed(1)}%
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setDrawerItem({
                                    title: `evaluations / #${ev.callRecord.externalCallId}`,
                                    subtitle: `Snapshot: ${ev.formNameSnapshot}`,
                                    raw: ev,
                                    callRecord: ev.callRecord,
                                  })
                                }
                                className="px-2.5 py-1 rounded border border-zinc-700 hover:bg-zinc-800 text-xs font-mono text-zinc-300"
                              >
                                Inspect
                              </button>
                              <Link
                                href={`/evaluations/${ev.id}`}
                                className="px-2.5 py-1 rounded bg-zinc-100 text-zinc-950 font-semibold text-xs inline-flex items-center gap-1"
                              >
                                <ExternalLink className="h-3 w-3" />
                                <span>Abrir</span>
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedCollection === "evaluation_form_templates" && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 font-mono text-zinc-500 bg-[#0b0b0d]">
                        <th className="py-3 px-4">name</th>
                        <th className="py-3 px-4 text-center">version</th>
                        <th className="py-3 px-4 text-center">passing_score</th>
                        <th className="py-3 px-4 text-right">inspector</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/80">
                      {filteredForms.map((f: FormTemplate) => (
                        <tr key={f.id} className="hover:bg-zinc-900/40">
                          <td className="py-3 px-4 font-bold text-zinc-100">
                            {f.name}
                          </td>
                          <td className="py-3 px-4 text-center font-mono text-zinc-400">
                            v{f.version}
                          </td>
                          <td className="py-3 px-4 text-center font-mono text-zinc-300">
                            {Number(f.passingScorePercentage).toFixed(0)}%
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                setDrawerItem({
                                  title: `form_templates / ${f.name}`,
                                  subtitle: `Versão v${f.version}`,
                                  raw: f,
                                })
                              }
                              className="px-2.5 py-1 rounded border border-zinc-700 hover:bg-zinc-800 text-xs font-mono text-zinc-300"
                            >
                              Inspect Schema
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {contentLayout === "kanban" && (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
              {(
                [
                  {
                    key: "PENDENTE",
                    title: "Fila Pendente",
                    items: calls.filter((c) => c.status === "PENDENTE"),
                  },
                  {
                    key: "APROVADO",
                    title: "Avaliadas • Aprovado",
                    items: calls.filter(
                      (c) => c.evaluationStatus === "APROVADO"
                    ),
                  },
                  {
                    key: "ALERTA",
                    title: "Reprovado / Erro Grave",
                    items: calls.filter(
                      (c) =>
                        c.evaluationStatus === "REPROVADO" ||
                        c.evaluationStatus === "ZERADO_ERRO_GRAVE"
                    ),
                  },
                ] as const
              ).map((col) => (
                <div
                  key={col.key}
                  className="rounded-xl border border-zinc-800 bg-[#101013] p-4 space-y-3"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                    <span className="text-xs font-bold text-zinc-200">
                      {col.title}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-900 text-zinc-300">
                      {col.items.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {col.items.map((call) => (
                      <div
                        key={call.id}
                        onClick={() =>
                          setDrawerItem({
                            title: `call_records / ${call.externalCallId}`,
                            subtitle: `Analista: ${call.analyst.name}`,
                            raw: call,
                            callRecord: call,
                          })
                        }
                        className="p-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] hover:border-zinc-600 cursor-pointer space-y-1"
                      >
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="font-bold text-zinc-100">
                            #{call.externalCallId}
                          </span>
                          <span className="text-zinc-400">
                            {formatDuration(call.durationSeconds)}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-300">
                          {call.analyst.name}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {contentLayout === "activity" && (
            <div className="rounded-xl border border-zinc-800 bg-[#101013] divide-y divide-zinc-800">
              {activities.map((act) => (
                <div
                  key={act.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-900 border border-zinc-700 text-zinc-200">
                        {act.action}
                      </span>
                      <span className="text-xs font-mono text-zinc-400">
                        {act.collection} • {act.itemKey}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-200">{act.summary}</p>
                  </div>
                  <div className="text-right text-[11px] text-zinc-500">
                    <p className="text-zinc-300">{act.actorName}</p>
                    <p>{formatDateTime(act.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Slide-Over Item Inspector Drawer (Organizado e Limpo, Sem JSON Bruto) */}
      <AnimatePresence>
        {drawerItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex justify-end"
            onClick={() => setDrawerItem(null)}
          >
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xl bg-[#0b0b0d] border-l border-zinc-800 h-full overflow-y-auto p-6 space-y-6 shadow-2xl"
            >
              {/* Cabeçalho do Painel */}
              <div className="flex items-start justify-between gap-4 border-b border-zinc-800 pb-4">
                <div className="space-y-1 min-w-0">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 block">
                    Detalhes do Registro
                  </span>
                  <h3 className="text-base font-bold text-zinc-100 truncate">
                    {drawerItem.callRecord
                      ? `Ligação #${drawerItem.callRecord.externalCallId}`
                      : drawerItem.title}
                  </h3>
                  <p className="text-xs text-zinc-400">{drawerItem.subtitle}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerItem(null)}
                  aria-label="Fechar painel"
                  className="h-8 w-8 rounded-lg border border-zinc-800 bg-[#121215] text-zinc-400 hover:text-zinc-100 flex items-center justify-center shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {drawerItem.callRecord ? (
                <div className="space-y-5">
                  {/* Reprodutor de Áudio */}
                  <div className="space-y-2">
                    <span className="text-xs font-mono uppercase tracking-wider text-zinc-400 block">
                      Áudio da Gravação
                    </span>
                    <CallAudioPlayer
                      audioUrl={drawerItem.callRecord.audioUrl}
                      externalCallId={drawerItem.callRecord.externalCallId}
                      durationSeconds={drawerItem.callRecord.durationSeconds}
                    />
                  </div>

                  {/* Grade Organizada de Metadados da Chamada */}
                  <div className="space-y-2">
                    <span className="text-xs font-mono uppercase tracking-wider text-zinc-400 block">
                      Informações da Chamada
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3.5 rounded-xl border border-zinc-800/90 bg-[#121215] space-y-1">
                        <span className="text-[11px] text-zinc-500 block">
                          Analista Responsável
                        </span>
                        <p className="text-xs font-semibold text-zinc-100">
                          {drawerItem.callRecord.analyst.name}
                        </p>
                        <p className="text-[11px] font-mono text-zinc-400 truncate">
                          {drawerItem.callRecord.analyst.email}
                        </p>
                      </div>

                      <div className="p-3.5 rounded-xl border border-zinc-800/90 bg-[#121215] space-y-1">
                        <span className="text-[11px] text-zinc-500 block">
                          Setor & Liderança
                        </span>
                        <p className="text-xs font-semibold text-zinc-100">
                          {drawerItem.callRecord.analyst.department || "Geral"}
                        </p>
                        <p className="text-[11px] text-zinc-400 truncate">
                          {drawerItem.callRecord.analyst.managerName ||
                            "Gestão QA"}
                        </p>
                      </div>

                      <div className="p-3.5 rounded-xl border border-zinc-800/90 bg-[#121215] space-y-1">
                        <span className="text-[11px] text-zinc-500 block">
                          Cliente / Contato
                        </span>
                        <p className="text-xs font-semibold text-zinc-100">
                          {drawerItem.callRecord.customer?.name ||
                            "Cliente Identificado"}
                        </p>
                        <p className="text-[11px] font-mono text-zinc-400">
                          {drawerItem.callRecord.customerIdentifier}
                        </p>
                      </div>

                      <div className="p-3.5 rounded-xl border border-zinc-800/90 bg-[#121215] space-y-1">
                        <span className="text-[11px] text-zinc-500 block">
                          Duração & Data
                        </span>
                        <p className="text-xs font-semibold font-mono text-zinc-100">
                          {formatDuration(
                            drawerItem.callRecord.durationSeconds
                          )}
                        </p>
                        <p className="text-[11px] text-zinc-400">
                          {formatDateTime(drawerItem.callRecord.callDate)}
                        </p>
                      </div>

                      <div className="p-3.5 rounded-xl border border-zinc-800/90 bg-[#121215] space-y-1">
                        <span className="text-[11px] text-zinc-500 block">
                          Campanha & Canal
                        </span>
                        <p className="text-xs font-semibold text-zinc-100">
                          {drawerItem.callRecord.campaign || "Padrão"}
                        </p>
                        <p className="text-[11px] font-mono text-zinc-400">
                          Canal: {drawerItem.callRecord.channel || "VOZ"}
                        </p>
                      </div>

                      <div className="p-3.5 rounded-xl border border-zinc-800/90 bg-[#121215] space-y-1">
                        <span className="text-[11px] text-zinc-500 block">
                          Status de Auditoria
                        </span>
                        <p className="text-xs font-semibold text-zinc-100">
                          {drawerItem.callRecord.status === "AVALIADA"
                            ? `Avaliada (${Number(
                                drawerItem.callRecord.finalScorePercentage ?? 0
                              ).toFixed(1)}%)`
                            : "Pendente de Avaliação"}
                        </p>
                        <p className="text-[11px] font-mono text-zinc-400">
                          {drawerItem.callRecord.evaluationStatus || "Na fila"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Ações Rápidas */}
                  <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-2.5">
                    {drawerItem.callRecord.evaluationId ? (
                      <Link
                        href={`/evaluations/${drawerItem.callRecord.evaluationId}`}
                        className="h-9 px-4 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-zinc-200 text-xs font-semibold inline-flex items-center gap-1.5"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>Ver Espelho da Avaliação</span>
                      </Link>
                    ) : (
                      <Link
                        href={`/analysts/${drawerItem.callRecord.analyst.id}`}
                        className="h-9 px-4 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-zinc-200 text-xs font-semibold inline-flex items-center gap-1.5"
                      >
                        <Headphones className="h-3.5 w-3.5" />
                        <span>Avaliar Esta Ligação</span>
                      </Link>
                    )}
                  </div>
                </div>
              ) : (
                /* Visualização Limpa para Formulários Inspecionados */
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-zinc-800 bg-[#121215] flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-zinc-500 block">
                        Formulário Selecionado
                      </span>
                      <p className="text-sm font-semibold text-zinc-100">
                        {drawerItem.title.replace("form_templates / ", "")}
                      </p>
                    </div>
                    <Link
                      href="/forms"
                      className="h-8 px-3 rounded-lg bg-zinc-100 text-zinc-950 text-xs font-semibold inline-flex items-center"
                    >
                      Editar no Construtor
                    </Link>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function DataStudioPage() {
  return (
    <AppShell>
      <Suspense
        fallback={
          <div className="p-8 text-xs text-zinc-500">
            Carregando Directus Studio...
          </div>
        }
      >
        <DirectusStudioWorkspace defaultSection="data-model" />
      </Suspense>
    </AppShell>
  );
}
