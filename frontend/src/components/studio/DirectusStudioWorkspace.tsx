"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Columns3,
  Download,
  ExternalLink,
  Eye,
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
import { CallRecord, FormTemplate, StudioActivity } from "@/types";

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
type ActivityFilterType = "ALL" | "EVALUATION" | "FATAL" | "CALL" | "SYSTEM";

function getInitials(name: string): string {
  return (name || "S")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");
}

function getActivityMeta(action: string) {
  if (action === "evaluation.fatal_zero") {
    return {
      label: "Falta Grave (0%)",
      badgeClass:
        "bg-red-950/40 border-red-800/70 text-red-300",
      dotClass: "bg-red-400",
    };
  }
  if (action.startsWith("evaluation.")) {
    return {
      label: "Avaliação Publicada",
      badgeClass:
        "bg-emerald-950/35 border-emerald-800/60 text-emerald-300",
      dotClass: "bg-emerald-400",
    };
  }
  if (action.startsWith("call.")) {
    return {
      label: "Gravação Recebida",
      badgeClass:
        "bg-[#141418] border-zinc-800 text-zinc-300",
      dotClass: "bg-zinc-400",
    };
  }
  if (action.startsWith("flow.")) {
    return {
      label: "Automação Executada",
      badgeClass:
        "bg-sky-950/35 border-sky-800/60 text-sky-300",
      dotClass: "bg-sky-400",
    };
  }
  return {
    label: "Evento do Sistema",
    badgeClass:
      "bg-amber-950/35 border-amber-800/60 text-amber-300",
    dotClass: "bg-amber-400",
  };
}

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
  const [activityFilter, setActivityFilter] =
    useState<ActivityFilterType>("ALL");
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
  }, [searchParams, router, sectionParam]);

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

  const filteredActivities = useMemo(() => {
    return activities.filter((act: StudioActivity) => {
      if (
        activityFilter === "EVALUATION" &&
        !act.action.startsWith("evaluation.")
      ) {
        return false;
      }
      if (
        activityFilter === "FATAL" &&
        act.action !== "evaluation.fatal_zero"
      ) {
        return false;
      }
      if (activityFilter === "CALL" && !act.action.startsWith("call.")) {
        return false;
      }
      if (
        activityFilter === "SYSTEM" &&
        (act.action.startsWith("evaluation.") || act.action.startsWith("call."))
      ) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        act.summary.toLowerCase().includes(q) ||
        act.actorName.toLowerCase().includes(q) ||
        act.itemKey.toLowerCase().includes(q)
      );
    });
  }, [activities, activityFilter, searchQuery]);

  const activityStats = useMemo(() => {
    const total = activities.length;
    const evals = activities.filter((a) =>
      a.action.startsWith("evaluation.")
    ).length;
    const callsIngested = activities.filter((a) =>
      a.action.startsWith("call.")
    ).length;
    const fatals = activities.filter(
      (a) => a.action === "evaluation.fatal_zero"
    ).length;
    return { total, evals, callsIngested, fatals };
  }, [activities]);

  const exportCurrentDataJson = () => {
    const payload =
      contentLayout === "activity"
        ? filteredActivities
        : selectedCollection === "call_records"
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
    a.download = `nexform-${contentLayout}-export.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isGestor) {
    return (
      <div className="p-6 rounded-xl border border-zinc-800 bg-[#101013] text-zinc-300 text-sm">
        Acesso restrito ao perfil de Gestão.
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-12 w-full overflow-x-hidden">
      {activeSection === "data-model" && (
        <DirectusDataModelView
          collections={collections}
          onInspectCollectionData={(colKey) => {
            setSelectedCollection(colKey as ActiveCollectionKey);
            router.push("/studio?section=content&layout=table");
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

      {/* ====================================================================
          EXPLORADOR DE DADOS / FILA KANBAN / TRILHA DE AUDITORIA
         ==================================================================== */}
      {activeSection === "content" && (
        <div className="space-y-4">
          {/* 1. MODO TRILHA DE AUDITORIA */}
          {contentLayout === "activity" && (
            <>
              {/* Strip de Resumo da Trilha de Auditoria */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="px-4 py-3.5 rounded-xl border border-zinc-800/80 bg-[#0e0e11] flex items-baseline justify-between">
                  <span className="text-xs text-zinc-400">
                    Eventos Registrados
                  </span>
                  <span className="text-lg font-semibold font-mono text-zinc-100">
                    {activityStats.total}
                  </span>
                </div>
                <div className="px-4 py-3.5 rounded-xl border border-zinc-800/80 bg-[#0e0e11] flex items-baseline justify-between">
                  <span className="text-xs text-zinc-400">
                    Avaliações Publicadas
                  </span>
                  <span className="text-lg font-semibold font-mono text-emerald-400">
                    {activityStats.evals}
                  </span>
                </div>
                <div className="px-4 py-3.5 rounded-xl border border-zinc-800/80 bg-[#0e0e11] flex items-baseline justify-between">
                  <span className="text-xs text-zinc-400">
                    Gravações Vinculadas
                  </span>
                  <span className="text-lg font-semibold font-mono text-zinc-100">
                    {activityStats.callsIngested}
                  </span>
                </div>
                <div className="px-4 py-3.5 rounded-xl border border-zinc-800/80 bg-[#0e0e11] flex items-baseline justify-between">
                  <span className="text-xs text-zinc-400">Faltas Graves</span>
                  <span className="text-lg font-semibold font-mono text-red-400">
                    {activityStats.fatals}
                  </span>
                </div>
              </div>

              {/* Barra de Ferramentas da Trilha de Auditoria */}
              <div className="p-3 rounded-xl border border-zinc-800/80 bg-[#0e0e11] flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                  <div className="relative w-full sm:w-64">
                    <Search className="h-3.5 w-3.5 text-zinc-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar protocolo, analista ou gestor..."
                      className="w-full h-8 pl-8 pr-3 rounded-md border border-zinc-800 bg-[#09090b] text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
                    />
                  </div>

                  <div className="inline-flex items-center p-0.5 rounded-lg bg-[#09090b] border border-zinc-800/80">
                    {(
                      [
                        { key: "ALL", label: "Todos" },
                        { key: "EVALUATION", label: "Avaliações" },
                        { key: "FATAL", label: "Falta Grave" },
                        { key: "CALL", label: "Gravações" },
                        { key: "SYSTEM", label: "Sistema" },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActivityFilter(tab.key)}
                        className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors ${
                          activityFilter === tab.key
                            ? "bg-zinc-100 text-zinc-950 font-semibold"
                            : "text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="inline-flex items-center p-0.5 rounded-lg bg-[#09090b] border border-zinc-800/80">
                    <button
                      type="button"
                      onClick={() =>
                        router.push("/studio?section=content&layout=table")
                      }
                      className="h-7 px-2.5 rounded-md text-xs text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1.5"
                    >
                      <Table2 className="h-3.5 w-3.5" />
                      <span>Tabela</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        router.push("/studio?section=content&layout=kanban")
                      }
                      className="h-7 px-2.5 rounded-md text-xs text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1.5"
                    >
                      <Columns3 className="h-3.5 w-3.5" />
                      <span>Kanban</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        router.push("/studio?section=content&layout=activity")
                      }
                      className="h-7 px-2.5 rounded-md text-xs bg-zinc-100 text-zinc-950 font-semibold inline-flex items-center gap-1.5"
                    >
                      <Activity className="h-3.5 w-3.5" />
                      <span>Auditoria</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={exportCurrentDataJson}
                    className="h-8 px-3 rounded-md border border-zinc-800 bg-[#141418] hover:bg-zinc-800 text-xs text-zinc-200 inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Exportar</span>
                  </button>
                </div>
              </div>

              {/* Lista Editorial da Trilha de Auditoria */}
              <div className="rounded-xl border border-zinc-800/80 bg-[#0e0e11] divide-y divide-zinc-800/60 overflow-hidden">
                {filteredActivities.length === 0 ? (
                  <div className="py-12 text-center text-xs text-zinc-500">
                    Nenhum evento encontrado para o filtro selecionado.
                  </div>
                ) : (
                  filteredActivities.map((act) => {
                    const meta = getActivityMeta(act.action);
                    return (
                      <div
                        key={act.id}
                        className="p-4 sm:px-5 sm:py-3.5 hover:bg-zinc-900/35 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                      >
                        <div className="flex items-start gap-3.5 min-w-0 flex-1">
                          <div className="h-8 w-8 rounded-lg bg-[#15151a] border border-zinc-800 flex items-center justify-center text-[11px] font-mono font-semibold text-zinc-300 shrink-0 mt-0.5">
                            {getInitials(act.actorName)}
                          </div>

                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-medium ${meta.badgeClass}`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`}
                                />
                                <span>{meta.label}</span>
                              </span>

                              <span className="px-2 py-0.5 rounded bg-[#141418] border border-zinc-800 text-[11px] font-mono text-zinc-300">
                                #{act.itemKey}
                              </span>
                            </div>

                            <p className="text-xs text-zinc-200 leading-relaxed">
                              {act.summary}
                            </p>
                          </div>
                        </div>

                        <div className="flex sm:flex-row lg:flex-col items-center lg:items-end justify-between gap-1 text-[11px] shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-zinc-800/50">
                          <span className="font-medium text-zinc-300">
                            {act.actorName}
                          </span>
                          <span className="font-mono text-zinc-500">
                            {formatDateTime(act.timestamp)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}

          {/* 2. MODO TABELA E MODO KANBAN */}
          {contentLayout !== "activity" && (
            <>
              {/* Barra de Ferramentas Unificada (Abas em Português + Busca + Seletor de Visão) */}
              <div className="p-3 rounded-xl border border-zinc-800/80 bg-[#0e0e11] flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                  {contentLayout === "table" && (
                    <div className="inline-flex items-center p-0.5 rounded-lg bg-[#09090b] border border-zinc-800/80">
                      {(
                        [
                          {
                            key: "call_records",
                            label: "Gravações",
                            count: calls.length,
                          },
                          {
                            key: "evaluations",
                            label: "Avaliações",
                            count: evaluations.length,
                          },
                          {
                            key: "evaluation_form_templates",
                            label: "Formulários",
                            count: forms.length,
                          },
                        ] as const
                      ).map((col) => (
                        <button
                          key={col.key}
                          type="button"
                          onClick={() => setSelectedCollection(col.key)}
                          className={`h-7 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
                            selectedCollection === col.key
                              ? "bg-zinc-100 text-zinc-950 font-semibold"
                              : "text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          <span>{col.label}</span>
                          <span className="text-[10px] font-mono opacity-75">
                            ({col.count})
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="relative w-full sm:w-64">
                    <Search className="h-3.5 w-3.5 text-zinc-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar registro, protocolo ou analista..."
                      className="w-full h-8 pl-8 pr-3 rounded-md border border-zinc-800 bg-[#09090b] text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="inline-flex items-center p-0.5 rounded-lg bg-[#09090b] border border-zinc-800/80">
                    <button
                      type="button"
                      onClick={() =>
                        router.push("/studio?section=content&layout=table")
                      }
                      className={`h-7 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 ${
                        contentLayout === "table"
                          ? "bg-zinc-100 text-zinc-950 font-semibold"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      <Table2 className="h-3.5 w-3.5" />
                      <span>Tabela</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        router.push("/studio?section=content&layout=kanban")
                      }
                      className={`h-7 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 ${
                        contentLayout === "kanban"
                          ? "bg-zinc-100 text-zinc-950 font-semibold"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      <Columns3 className="h-3.5 w-3.5" />
                      <span>Kanban</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        router.push("/studio?section=content&layout=activity")
                      }
                      className="h-7 px-2.5 rounded-md text-xs text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1.5"
                    >
                      <Activity className="h-3.5 w-3.5" />
                      <span>Auditoria</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={exportCurrentDataJson}
                    className="h-8 px-3 rounded-md border border-zinc-800 bg-[#141418] hover:bg-zinc-800 text-xs text-zinc-200 inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Exportar</span>
                  </button>
                </div>
              </div>

              {/* VISÃO TABELA FLUIDA (100% PORTUGUÊS, SEM SCROLL HORIZONTAL) */}
              {contentLayout === "table" && (
                <div className="rounded-xl border border-zinc-800/80 bg-[#0e0e11] overflow-hidden">
                  {selectedCollection === "call_records" && (
                    <div className="divide-y divide-zinc-800/60">
                      {filteredCalls.map((call) => {
                        const badge = getEvaluationStatusBadge(
                          call.evaluationStatus
                        );
                        return (
                          <div
                            key={call.id}
                            className="p-4 sm:px-5 sm:py-3.5 hover:bg-zinc-900/35 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3.5 min-w-0">
                              <span className="px-2.5 py-1 rounded-md bg-[#141418] border border-zinc-800 font-mono text-xs font-semibold text-zinc-100">
                                #{call.externalCallId}
                              </span>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-zinc-100 truncate">
                                  {call.analyst.name}
                                </p>
                                <p className="text-[11px] font-mono text-zinc-500">
                                  Cliente: {call.customerIdentifier} •{" "}
                                  {formatDuration(call.durationSeconds)}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[11px] ${badge.className}`}
                              >
                                {call.status === "AVALIADA"
                                  ? badge.label
                                  : "Pendente"}
                              </span>

                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDrawerItem({
                                      title: `Ligação #${call.externalCallId}`,
                                      subtitle: `Analista: ${call.analyst.name}`,
                                      raw: call,
                                      callRecord: call,
                                    })
                                  }
                                  className="h-8 px-3 rounded-md border border-zinc-800 bg-[#141418] hover:bg-zinc-800 text-xs text-zinc-200 inline-flex items-center gap-1.5"
                                >
                                  <Eye className="h-3.5 w-3.5 text-zinc-400" />
                                  <span>Detalhes</span>
                                </button>
                                {call.status === "PENDENTE" && (
                                  <Link
                                    href={`/analysts/${call.analyst.id}?callId=${call.id}`}
                                    className="h-8 px-3 rounded-md bg-zinc-100 text-zinc-950 font-semibold text-xs inline-flex items-center gap-1.5"
                                  >
                                    <Headphones className="h-3.5 w-3.5" />
                                    <span>Avaliar</span>
                                  </Link>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {selectedCollection === "evaluations" && (
                    <div className="divide-y divide-zinc-800/60">
                      {filteredEvaluations.map((ev) => (
                        <div
                          key={ev.id}
                          className="p-4 sm:px-5 sm:py-3.5 hover:bg-zinc-900/35 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <span className="px-2.5 py-1 rounded-md bg-[#141418] border border-zinc-800 font-mono text-xs font-semibold text-zinc-100">
                              #{ev.callRecord.externalCallId}
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-zinc-100 truncate">
                                {ev.analyst.name}
                              </p>
                              <p className="text-[11px] text-zinc-500 truncate">
                                {ev.formNameSnapshot} • {ev.obtainedPoints}/
                                {ev.maxPossiblePoints} pts
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0">
                            <span className="font-mono text-sm font-bold text-zinc-100">
                              {Number(ev.finalScorePercentage).toFixed(1)}%
                            </span>

                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setDrawerItem({
                                    title: `Avaliação #${ev.callRecord.externalCallId}`,
                                    subtitle: ev.formNameSnapshot,
                                    raw: ev,
                                    callRecord: ev.callRecord,
                                  })
                                }
                                className="h-8 px-3 rounded-md border border-zinc-800 bg-[#141418] hover:bg-zinc-800 text-xs text-zinc-200 inline-flex items-center gap-1.5"
                              >
                                <Eye className="h-3.5 w-3.5 text-zinc-400" />
                                <span>Detalhes</span>
                              </button>
                              <Link
                                href={`/evaluations/${ev.id}`}
                                className="h-8 px-3 rounded-md bg-zinc-100 text-zinc-950 font-semibold text-xs inline-flex items-center gap-1.5"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                <span>Espelho</span>
                              </Link>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedCollection === "evaluation_form_templates" && (
                    <div className="divide-y divide-zinc-800/60">
                      {filteredForms.map((f: FormTemplate) => (
                        <div
                          key={f.id}
                          className="p-4 sm:px-5 sm:py-3.5 hover:bg-zinc-900/35 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-semibold text-zinc-100">
                                {f.name}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-[#141418] border border-zinc-800 text-[10px] font-mono text-zinc-300">
                                {f.sector || "Geral"}
                              </span>
                            </div>
                            <p className="text-[11px] font-mono text-zinc-500">
                              {f.standardItemsCount} critérios •{" "}
                              {f.maxPossiblePoints} pts • Meta:{" "}
                              {Number(f.passingScorePercentage).toFixed(0)}%
                            </p>
                          </div>

                          <div className="flex items-center justify-end gap-2 shrink-0">
                            <Link
                              href="/forms"
                              className="h-8 px-3 rounded-md bg-zinc-100 text-zinc-950 font-semibold text-xs inline-flex items-center gap-1.5"
                            >
                              <span>Editar Formulário</span>
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* VISÃO KANBAN */}
              {contentLayout === "kanban" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(
                    [
                      {
                        key: "PENDENTE",
                        title: "Fila Pendente",
                        items: filteredCalls.filter(
                          (c) => c.status === "PENDENTE"
                        ),
                      },
                      {
                        key: "APROVADO",
                        title: "Avaliadas • Aprovado",
                        items: filteredCalls.filter(
                          (c) => c.evaluationStatus === "APROVADO"
                        ),
                      },
                      {
                        key: "ALERTA",
                        title: "Reprovado / Falta Grave",
                        items: filteredCalls.filter(
                          (c) =>
                            c.evaluationStatus === "REPROVADO" ||
                            c.evaluationStatus === "ZERADO_ERRO_GRAVE"
                        ),
                      },
                    ] as const
                  ).map((col) => (
                    <div
                      key={col.key}
                      className="rounded-xl border border-zinc-800/80 bg-[#0e0e11] p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800/80">
                        <span className="text-xs font-semibold text-zinc-200">
                          {col.title}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-[#141418] border border-zinc-800 text-zinc-300">
                          {col.items.length}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {col.items.map((call) => (
                          <div
                            key={call.id}
                            onClick={() =>
                              setDrawerItem({
                                title: `Ligação #${call.externalCallId}`,
                                subtitle: `Analista: ${call.analyst.name}`,
                                raw: call,
                                callRecord: call,
                              })
                            }
                            className="p-3.5 rounded-lg border border-zinc-800/90 bg-[#121215] hover:border-zinc-600 cursor-pointer space-y-1.5 transition-colors"
                          >
                            <div className="flex items-center justify-between text-xs font-mono">
                              <span className="font-semibold text-zinc-100">
                                #{call.externalCallId}
                              </span>
                              <span className="text-zinc-400">
                                {formatDuration(call.durationSeconds)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-medium text-zinc-300 truncate">
                                {call.analyst.name}
                              </p>
                              {call.finalScorePercentage !== null &&
                                call.finalScorePercentage !== undefined && (
                                  <span className="text-[11px] font-mono font-semibold text-zinc-200">
                                    {Number(call.finalScorePercentage).toFixed(
                                      0
                                    )}
                                    %
                                  </span>
                                )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Slide-Over Item Inspector Drawer */}
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
                    </div>
                  </div>

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
                        href={`/analysts/${drawerItem.callRecord.analyst.id}?callId=${drawerItem.callRecord.id}`}
                        className="h-9 px-4 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-zinc-200 text-xs font-semibold inline-flex items-center gap-1.5"
                      >
                        <Headphones className="h-3.5 w-3.5" />
                        <span>Avaliar Esta Ligação</span>
                      </Link>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-zinc-800 bg-[#121215] flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-zinc-500 block">
                      Formulário Selecionado
                    </span>
                    <p className="text-sm font-semibold text-zinc-100">
                      {drawerItem.title}
                    </p>
                  </div>
                  <Link
                    href="/forms"
                    className="h-8 px-3 rounded-lg bg-zinc-100 text-zinc-950 text-xs font-semibold inline-flex items-center"
                  >
                    Editar no Construtor
                  </Link>
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
            Carregando...
          </div>
        }
      >
        <DirectusStudioWorkspace defaultSection="data-model" />
      </Suspense>
    </AppShell>
  );
}
