"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CheckSquare,
  FileCheck2,
  Info,
  ShieldAlert,
  User,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { CallAudioPlayer } from "@/components/audio/CallAudioPlayer";
import { useAuth } from "@/context/AuthContext";
import {
  callsApi,
  evaluationsApi,
  extractErrorMessage,
  formsApi,
} from "@/lib/api";
import { formatDateTime, formatDuration } from "@/lib/utils";
import { FormItem } from "@/types";

export default function EvaluateCallPage() {
  const params = useParams<{ id: string }>();
  const callId = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isGestor } = useAuth();

  const [selectedFormId, setSelectedFormId] = useState<string>("");
  const [checkedMap, setCheckedMap] = useState<Record<string, boolean>>({});
  const [observationMap, setObservationMap] = useState<Record<string, string>>(
    {}
  );
  const [generalFeedback, setGeneralFeedback] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isCustomFormModalOpen, setIsCustomFormModalOpen] = useState(false);
  const [customFormTitle, setCustomFormTitle] = useState("");
  const [customFormItems, setCustomFormItems] = useState([
    {
      label: "Saudação institucional e identificação no início da chamada",
      category: "Abordagem",
      fatalError: false,
    },
    {
      label: "Validação positiva dos dados do cliente (Segurança/LGPD)",
      category: "Segurança",
      fatalError: false,
    },
    {
      label: "Condução assertiva, clareza na proposta e protocolo informado",
      category: "Fechamento",
      fatalError: false,
    },
    {
      label: "ERRO GRAVE: Rispidez, ironia ou desligamento indevido",
      category: "Erro Grave",
      fatalError: true,
    },
  ]);

  const { data: call, isLoading: loadingCall } = useQuery({
    queryKey: ["call-detail", callId],
    queryFn: () => callsApi.getById(callId),
    enabled: !!callId,
  });

  const { data: forms = [], isLoading: loadingForms } = useQuery({
    queryKey: ["active-forms"],
    queryFn: () => formsApi.list(true),
  });

  useEffect(() => {
    if (forms.length > 0 && !selectedFormId) {
      setSelectedFormId(forms[0].id);
    }
  }, [forms, selectedFormId]);

  const selectedForm = useMemo(
    () => forms.find((f) => f.id === selectedFormId) || null,
    [forms, selectedFormId]
  );

  useEffect(() => {
    if (selectedForm) {
      const nextChecked: Record<string, boolean> = {};
      selectedForm.items.forEach((item) => {
        nextChecked[item.id] = false;
      });
      setCheckedMap(nextChecked);
      setObservationMap({});
    }
  }, [selectedForm]);

  const standardItems = useMemo(
    () => (selectedForm ? selectedForm.items.filter((i) => !i.fatalError) : []),
    [selectedForm]
  );

  const fatalItems = useMemo(
    () => (selectedForm ? selectedForm.items.filter((i) => i.fatalError) : []),
    [selectedForm]
  );

  const groupedStandardItems = useMemo(() => {
    const groups: Record<string, FormItem[]> = {};
    standardItems.forEach((item) => {
      if (!groups[item.category]) {
        groups[item.category] = [];
      }
      groups[item.category].push(item);
    });
    return groups;
  }, [standardItems]);

  const liveScore = useMemo(() => {
    if (!selectedForm) {
      return {
        obtainedPoints: 0,
        maxPossiblePoints: 0,
        rawPercentage: 0,
        finalPercentage: 0,
        fatalTriggered: false,
        status: "REPROVADO" as const,
      };
    }

    const maxPossiblePoints = standardItems.reduce(
      (acc, item) => acc + (item.points && item.points > 0 ? item.points : 1),
      0
    );
    const obtainedPoints = standardItems
      .filter((i) => checkedMap[i.id] === true)
      .reduce(
        (acc, item) => acc + (item.points && item.points > 0 ? item.points : 1),
        0
      );
    const fatalTriggered = fatalItems.some((i) => checkedMap[i.id] === true);

    const rawPercentage =
      maxPossiblePoints > 0 ? (obtainedPoints / maxPossiblePoints) * 100 : 100;

    if (fatalTriggered) {
      return {
        obtainedPoints,
        maxPossiblePoints,
        rawPercentage,
        finalPercentage: 0,
        fatalTriggered: true,
        status: "ZERADO_ERRO_GRAVE" as const,
      };
    }

    const finalPercentage = rawPercentage;
    const status =
      finalPercentage >= Number(selectedForm.passingScorePercentage)
        ? ("APROVADO" as const)
        : ("REPROVADO" as const);

    return {
      obtainedPoints,
      maxPossiblePoints,
      rawPercentage,
      finalPercentage,
      fatalTriggered: false,
      status,
    };
  }, [selectedForm, standardItems, fatalItems, checkedMap]);

  const submitMutation = useMutation({
    mutationFn: () => {
      if (!selectedForm) throw new Error("Selecione um formulário.");
      return evaluationsApi.submit({
        callRecordId: callId,
        formTemplateId: selectedForm.id,
        answers: selectedForm.items.map((item) => ({
          formItemId: item.id,
          checked: !!checkedMap[item.id],
          observation: observationMap[item.id] || undefined,
        })),
        generalFeedback,
      });
    },
    onSuccess: (createdEval) => {
      queryClient.invalidateQueries({ queryKey: ["calls-list"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      router.push(`/evaluations/${createdEval.id}`);
    },
    onError: (err) => {
      setSubmitError(extractErrorMessage(err));
    },
  });

  if (!isGestor) {
    return (
      <AppShell>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-800">
          Acesso restrito: Apenas usuários com perfil{" "}
          <strong>ROLE_GESTOR</strong> podem realizar avaliações de ligações.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6 pb-16">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Voltar para a Fila de Ligações</span>
          </button>
        </div>

        {loadingCall || loadingForms || !call ? (
          <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-sm text-slate-500">
            Carregando Cockpit de Avaliação...
          </div>
        ) : (
          <>
            {/* Sticky Cockpit Header + Audio Player */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-5"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="px-2.5 py-0.5 rounded-md bg-zinc-900 text-zinc-200 font-mono text-xs font-bold border border-zinc-800">
                      #{call.externalCallId}
                    </span>
                    <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                      Cockpit de Avaliação de Qualidade
                    </h1>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-400 mt-1.5">
                    <span className="inline-flex items-center gap-1">
                      <User className="h-3.5 w-3.5 text-slate-400" />
                      Analista: <strong>{call.analyst.name}</strong> (
                      {call.analyst.email})
                    </span>
                    <span>
                      Cliente:{" "}
                      <strong>
                        {call.customer?.name || call.customerIdentifier}
                      </strong>{" "}
                      ({call.customerIdentifier})
                    </span>
                    <span>Data: {formatDateTime(call.callDate)}</span>
                    <span>
                      Duração:{" "}
                      <strong>{formatDuration(call.durationSeconds)}</strong>
                    </span>
                  </div>
                </div>

                <div className="min-w-[280px] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Modelo de Formulário
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomFormTitle(
                          `Formulário Específico • #${call.externalCallId} (${call.analyst.name})`
                        );
                        setIsCustomFormModalOpen(true);
                      }}
                      className="text-[11px] font-semibold text-zinc-900 dark:text-zinc-100 underline hover:opacity-80"
                    >
                      + Criar Formulário desta Chamada
                    </button>
                  </div>
                  <select
                    value={selectedFormId}
                    onChange={(e) => setSelectedFormId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {forms.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} (v{f.version} • Corte:{" "}
                        {Number(f.passingScorePercentage).toFixed(0)}%)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <CallAudioPlayer
                audioUrl={call.audioUrl}
                externalCallId={call.externalCallId}
                durationSeconds={call.durationSeconds}
              />

              {isCustomFormModalOpen && (
                <div className="p-5 rounded-xl border border-zinc-700 bg-zinc-950 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase text-zinc-200">
                      Criar Formulário Específico para a Chamada #
                      {call.externalCallId}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setIsCustomFormModalOpen(false)}
                      className="text-xs text-zinc-400 hover:text-white"
                    >
                      Fechar
                    </button>
                  </div>

                  <input
                    type="text"
                    value={customFormTitle}
                    onChange={(e) => setCustomFormTitle(e.target.value)}
                    placeholder="Nome do formulário específico..."
                    className="w-full px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-900 text-xs text-white"
                  />

                  <div className="space-y-2">
                    {customFormItems.map((it, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={it.label}
                          onChange={(e) =>
                            setCustomFormItems((prev) =>
                              prev.map((row, i) =>
                                i === idx
                                  ? { ...row, label: e.target.value }
                                  : row
                              )
                            )
                          }
                          className="flex-1 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-xs text-white"
                        />
                        <select
                          value={it.fatalError ? "FATAL" : "STD"}
                          onChange={(e) => {
                            const isFatal = e.target.value === "FATAL";
                            setCustomFormItems((prev) =>
                              prev.map((row, i) =>
                                i === idx
                                  ? {
                                      ...row,
                                      fatalError: isFatal,
                                      category: isFatal
                                        ? "Erro Grave"
                                        : "Critério",
                                    }
                                  : row
                              )
                            );
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900 text-xs text-zinc-200"
                        >
                          <option value="STD">+1 Ponto</option>
                          <option value="FATAL">Erro Grave (0%)</option>
                        </select>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setCustomFormItems((prev) => [
                            ...prev,
                            {
                              label: "Novo critério da chamada",
                              category: "Critério",
                              fatalError: false,
                            },
                          ])
                        }
                        className="px-2.5 py-1 rounded-lg border border-zinc-700 text-xs text-zinc-300"
                      >
                        + Pergunta (1 pt)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setCustomFormItems((prev) => [
                            ...prev,
                            {
                              label: "ERRO GRAVE: Violação crítica",
                              category: "Erro Grave",
                              fatalError: true,
                            },
                          ])
                        }
                        className="px-2.5 py-1 rounded-lg border border-red-800 text-xs text-red-300"
                      >
                        + Erro Grave
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        const created = await formsApi.create({
                          name:
                            customFormTitle.trim() ||
                            `Formulário #${call.externalCallId}`,
                          description: `Criado para a chamada #${call.externalCallId}`,
                          passingScorePercentage: 75,
                          active: true,
                          items: customFormItems.map((item, idx) => ({
                            label: item.label,
                            description: "",
                            category: item.category,
                            fatalError: item.fatalError,
                            displayOrder: idx + 1,
                          })),
                        });
                        await queryClient.invalidateQueries({
                          queryKey: ["active-forms"],
                        });
                        setSelectedFormId(created.id);
                        setIsCustomFormModalOpen(false);
                      }}
                      className="px-4 py-1.5 rounded-lg bg-zinc-100 text-zinc-950 text-xs font-bold"
                    >
                      Aplicar Formulário nesta Chamada
                    </button>
                  </div>
                </div>
              )}
            </motion.div>

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              {/* Left 2 Columns: Checklist */}
              <div className="lg:col-span-2 space-y-6">
                {submitError && (
                  <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-red-700 text-xs font-medium">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{submitError}</span>
                  </div>
                )}

                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                  <div className="p-5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <CheckSquare className="h-5 w-5 text-blue-600" />
                      <div>
                        <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                          Checklist Regular de Qualidade (+1 Ponto por Item)
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Cada caixa marcada vale <strong>1 ponto</strong>.
                          Desmarcada vale <strong>0 pontos</strong>.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const allChecked = standardItems.every(
                          (i) => checkedMap[i.id]
                        );
                        const next = { ...checkedMap };
                        standardItems.forEach((i) => {
                          next[i.id] = !allChecked;
                        });
                        setCheckedMap(next);
                      }}
                      className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Marcar/Desmarcar Todos
                    </button>
                  </div>

                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {Object.entries(groupedStandardItems).map(
                      ([category, items]) => (
                        <div key={category} className="p-5 space-y-3">
                          <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-300 bg-zinc-900 border border-zinc-800 inline-block px-2.5 py-1 rounded-md">
                            {category}
                          </h3>

                          <div className="space-y-3">
                            {items.map((item) => {
                              const isChecked = !!checkedMap[item.id];
                              return (
                                <motion.div
                                  layout
                                  key={item.id}
                                  className={`p-4 rounded-xl border transition-all ${
                                    isChecked
                                      ? "bg-emerald-50/40 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800"
                                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                                  }`}
                                >
                                  <label className="flex items-start gap-3.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={(e) =>
                                        setCheckedMap((prev) => ({
                                          ...prev,
                                          [item.id]: e.target.checked,
                                        }))
                                      }
                                      className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                    />
                                    <div className="flex-1">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-semibold text-slate-900 dark:text-white">
                                          {item.label}
                                        </span>
                                        <span
                                          className={`px-2 py-0.5 rounded text-xs font-bold shrink-0 ${
                                            isChecked
                                              ? "bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200"
                                              : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                                          }`}
                                        >
                                          {isChecked
                                            ? `+${item.points || 1} pt`
                                            : `0 / ${item.points || 1} pt`}
                                        </span>
                                      </div>
                                      {item.description && (
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                          {item.description}
                                        </p>
                                      )}
                                    </div>
                                  </label>

                                  <div className="mt-2.5 pl-7">
                                    <input
                                      type="text"
                                      value={observationMap[item.id] || ""}
                                      onChange={(e) =>
                                        setObservationMap((prev) => ({
                                          ...prev,
                                          [item.id]: e.target.value,
                                        }))
                                      }
                                      placeholder="Observação opcional sobre este critério..."
                                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-200 placeholder-slate-400"
                                    />
                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>

                {/* Seção Erro Grave */}
                {fatalItems.length > 0 && (
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-red-200 dark:border-red-900 shadow-sm overflow-hidden">
                    <div className="p-5 bg-red-50 dark:bg-red-950/60 border-b border-red-200 dark:border-red-900 flex items-start gap-3">
                      <ShieldAlert className="h-6 w-6 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <h2 className="text-sm font-bold text-red-900 dark:text-red-200 uppercase tracking-wide">
                          Categoria: Erro Grave (Fatal Error)
                        </h2>
                        <p className="text-xs text-red-700 dark:text-red-300 mt-0.5">
                          Se qualquer item desta seção for assinalado, a{" "}
                          <strong>
                            nota final do formulário é zerada imediatamente
                            (Nota = 0%)
                          </strong>
                          , registrando status &ldquo;Reprovado / Zerado por
                          Erro Grave&rdquo;.
                        </p>
                      </div>
                    </div>

                    <div className="p-5 space-y-3">
                      {fatalItems.map((item) => {
                        const isViolated = !!checkedMap[item.id];
                        return (
                          <div
                            key={item.id}
                            className={`p-4 rounded-xl border-2 transition-all ${
                              isViolated
                                ? "bg-red-50 dark:bg-red-950/60 border-red-500 shadow-sm"
                                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                            }`}
                          >
                            <label className="flex items-start gap-3.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isViolated}
                                onChange={(e) =>
                                  setCheckedMap((prev) => ({
                                    ...prev,
                                    [item.id]: e.target.checked,
                                  }))
                                }
                                className="mt-1 h-4 w-4 rounded border-red-300 text-red-600 focus:ring-red-500 cursor-pointer"
                              />
                              <div className="flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                                    {item.label}
                                  </span>
                                  <span
                                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold shrink-0 ${
                                      isViolated
                                        ? "bg-red-600 text-white"
                                        : "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300"
                                    }`}
                                  >
                                    {isViolated
                                      ? "VIOLADO • NOTA = 0%"
                                      : "Erro Grave"}
                                  </span>
                                </div>
                                {item.description && (
                                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                                    {item.description}
                                  </p>
                                )}
                              </div>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 space-y-3">
                  <label className="block text-sm font-bold text-slate-900 dark:text-white">
                    Feedback Geral e Orientações do Gestor
                  </label>
                  <textarea
                    rows={4}
                    value={generalFeedback}
                    onChange={(e) => setGeneralFeedback(e.target.value)}
                    placeholder="Escreva o feedback construtivo sobre a condução da chamada..."
                    className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Right Column: Contador de Nota Flutuante Animado */}
              <div className="space-y-5">
                <motion.div
                  layout
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg p-6 space-y-5"
                >
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Contador de Nota em Tempo Real
                  </h3>

                  <AnimatePresence>
                    {liveScore.fatalTriggered && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="p-3.5 rounded-xl bg-red-600 text-white flex items-start gap-2.5 shadow-sm"
                      >
                        <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                        <div className="text-xs">
                          <p className="font-bold uppercase">
                            Nota Zerada por Erro Grave!
                          </p>
                          <p className="mt-0.5 text-red-100">
                            A violação de Erro Grave sobrepõe os{" "}
                            {liveScore.obtainedPoints} pontos marcados e zera a
                            nota final.
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="text-center py-5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                      Nota Final Calculada
                    </span>
                    <motion.p
                      key={`${liveScore.finalPercentage}-${liveScore.fatalTriggered}`}
                      initial={{ scale: 0.85, opacity: 0.5 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 320, damping: 20 }}
                      className={`text-4xl font-extrabold mt-1 ${
                        liveScore.status === "APROVADO"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : liveScore.status === "ZERADO_ERRO_GRAVE"
                          ? "text-red-600 dark:text-red-400"
                          : "text-amber-600 dark:text-amber-400"
                      }`}
                    >
                      {liveScore.finalPercentage.toFixed(1)}%
                    </motion.p>

                    <div className="mt-2.5">
                      {liveScore.status === "APROVADO" && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Status: APROVADO
                        </span>
                      )}
                      {liveScore.status === "REPROVADO" && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                          Status: REPROVADO
                        </span>
                      )}
                      {liveScore.status === "ZERADO_ERRO_GRAVE" && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          REPROVADO POR ERRO GRAVE
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2.5 text-xs border-t border-slate-200 dark:border-slate-800 pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Pontuação Bruta:</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {liveScore.obtainedPoints} /{" "}
                        {liveScore.maxPossiblePoints} pts
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">
                        Aproveitamento Bruto:
                      </span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {liveScore.rawPercentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 flex items-start gap-2 text-[11px] text-zinc-300">
                    <Info className="h-4 w-4 text-zinc-400 shrink-0 mt-0.5" />
                    <span>
                      Ao finalizar, o snapshot das perguntas e respostas será
                      gravado permanentemente.
                    </span>
                  </div>

                  <button
                    type="button"
                    disabled={submitMutation.isPending || !selectedForm}
                    onClick={() => submitMutation.mutate()}
                    className="w-full h-10 px-4 rounded-lg bg-zinc-100 hover:bg-zinc-200 disabled:opacity-50 text-zinc-950 font-semibold text-xs flex items-center justify-center gap-2 transition-all"
                  >
                    <FileCheck2 className="h-4 w-4" />
                    <span>
                      {submitMutation.isPending
                        ? "Salvando Avaliação..."
                        : "Finalizar e Submeter Avaliação"}
                    </span>
                  </button>
                </motion.div>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
