"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  Loader2,
  Pencil,
  Save,
  ShieldAlert,
  X,
} from "lucide-react";
import { evaluationsApi, extractErrorMessage } from "@/lib/api";

interface EditEvaluationScoreModalProps {
  evaluationId: string | null;
  onClose: () => void;
}

export function EditEvaluationScoreModal({
  evaluationId,
  onClose,
}: EditEvaluationScoreModalProps) {
  const queryClient = useQueryClient();

  const {
    data: evaluation,
    isLoading,
    error: loadError,
  } = useQuery({
    queryKey: ["evaluation-detail", evaluationId],
    queryFn: () => evaluationsApi.getById(evaluationId!),
    enabled: !!evaluationId,
  });

  const [fatalTriggered, setFatalTriggered] = useState(false);
  const [generalFeedback, setGeneralFeedback] = useState("");
  const [checkedMap, setCheckedMap] = useState<Record<string, boolean>>({});
  const [obsMap, setObsMap] = useState<Record<string, string>>({});
  const [filterMode, setFilterMode] = useState<"ALL" | "UNCHECKED">("ALL");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!evaluation) return;
    setFatalTriggered(Boolean(evaluation.fatalErrorTriggered));
    setGeneralFeedback(evaluation.generalFeedback || "");

    const nonFatalItems = evaluation.items.filter((i) => !i.fatalError);
    const allRegularFalse =
      nonFatalItems.length > 0 && nonFatalItems.every((i) => !i.checked);
    const aiData =
      evaluation.callRecord?.metadata?.aiEvaluationData &&
      typeof evaluation.callRecord.metadata.aiEvaluationData === "object"
        ? (evaluation.callRecord.metadata.aiEvaluationData as Record<
            string,
            unknown
          >)
        : null;

    const initialChecked: Record<string, boolean> = {};
    const initialObs: Record<string, string> = {};

    evaluation.items.forEach((it) => {
      if (it.fatalError) {
        initialChecked[it.id] = Boolean(it.checked);
      } else if (allRegularFalse && aiData) {
        const bulletIdx = it.label.indexOf("•");
        const key =
          bulletIdx > 0
            ? it.label.substring(0, bulletIdx).trim()
            : it.label.trim();
        const rawVal =
          aiData[key] !== undefined
            ? aiData[key]
            : key === "Faz_questionamentos_direcionados"
            ? aiData["Questionamentos_direcionados"]
            : undefined;
        if (typeof rawVal === "boolean") {
          initialChecked[it.id] = rawVal;
        } else if (typeof rawVal === "number") {
          initialChecked[it.id] = rawVal > 0;
        } else if (typeof rawVal === "string") {
          const clean = rawVal.trim().toLowerCase();
          initialChecked[it.id] =
            clean !== "false" &&
            clean !== "0" &&
            clean !== "não" &&
            clean !== "nao";
        } else {
          initialChecked[it.id] = true;
        }
      } else if (allRegularFalse) {
        initialChecked[it.id] = true;
      } else {
        initialChecked[it.id] = Boolean(it.checked);
      }
      initialObs[it.id] = it.observation || "";
    });

    setCheckedMap(initialChecked);
    setObsMap(initialObs);
    setFilterMode("ALL");
    setSaveError(null);
  }, [evaluation]);

  const standardItems = useMemo(
    () => (evaluation ? evaluation.items.filter((i) => !i.fatalError) : []),
    [evaluation]
  );

  const fatalItems = useMemo(
    () => (evaluation ? evaluation.items.filter((i) => i.fatalError) : []),
    [evaluation]
  );

  const visibleStandardItems = useMemo(() => {
    if (filterMode === "UNCHECKED") {
      return standardItems.filter((it) => !checkedMap[it.id]);
    }
    return standardItems;
  }, [standardItems, filterMode, checkedMap]);

  const calculatedStats = useMemo(() => {
    if (!evaluation) {
      return {
        obtainedPoints: 0,
        maxPossiblePoints: 100,
        calculatedPct: 0,
        effectivePct: 0,
        passingPct: 80,
        uncheckedCount: 0,
      };
    }
    let maxPts = 0;
    let obtPts = 0;
    let uncheckedCount = 0;
    standardItems.forEach((it) => {
      const w = it.points && it.points > 0 ? it.points : 1;
      maxPts += w;
      if (checkedMap[it.id]) {
        obtPts += w;
      } else {
        uncheckedCount++;
      }
    });
    if (maxPts <= 0) {
      maxPts = evaluation.maxPossiblePoints || 100;
    }
    const calcPct = Math.round((obtPts / maxPts) * 100);
    const effectivePct = fatalTriggered ? 0 : calcPct;

    return {
      obtainedPoints: obtPts,
      maxPossiblePoints: maxPts,
      calculatedPct: calcPct,
      effectivePct,
      passingPct: Number(evaluation.passingScoreSnapshot || 80),
      uncheckedCount,
    };
  }, [evaluation, standardItems, checkedMap, fatalTriggered]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!evaluationId || !evaluation) {
        throw new Error("Avaliação não carregada.");
      }
      setSaveError(null);

      const itemsPayload = evaluation.items.map((it) => ({
        id: it.id,
        checked: it.fatalError
          ? fatalTriggered && Boolean(checkedMap[it.id])
          : Boolean(checkedMap[it.id]),
        observation: obsMap[it.id] ?? "",
      }));

      return evaluationsApi.update(evaluationId, {
        manualFinalScore: null,
        fatalErrorTriggered: fatalTriggered,
        generalFeedback,
        items: itemsPayload,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calls-list"] });
      queryClient.invalidateQueries({ queryKey: ["evaluations-list"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({
        queryKey: ["evaluation-detail", evaluationId],
      });
      onClose();
    },
    onError: (err) => {
      setSaveError(extractErrorMessage(err));
    },
  });

  if (!evaluationId) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl border border-zinc-800 bg-[#0b0b0d] shadow-2xl overflow-hidden"
        >
          {/* Cabeçalho */}
          <div className="px-5 py-3.5 border-b border-zinc-800/80 flex items-center justify-between gap-3 bg-[#101014] shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                <Pencil className="h-4 w-4 text-zinc-200" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-zinc-100 truncate">
                  Revisar Formulário e Nota da Avaliação
                </h2>
                {evaluation && (
                  <p className="text-[11px] font-mono text-zinc-400 truncate">
                    #{evaluation.callRecord.externalCallId} •{" "}
                    {evaluation.analyst.name} (
                    {evaluation.analystSectorSnapshot ||
                      evaluation.analyst.department}
                    ) • {evaluation.formNameSnapshot}
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar modal"
              className="h-8 w-8 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 flex items-center justify-center transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Corpo Rolável */}
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
            {isLoading ? (
              <div className="py-16 flex flex-col items-center justify-center gap-2 text-xs text-zinc-400">
                <Loader2 className="h-5 w-5 animate-spin text-zinc-300" />
                <span>Carregando formulário da avaliação…</span>
              </div>
            ) : loadError || !evaluation ? (
              <div className="p-4 rounded-xl bg-red-950/40 border border-red-900 text-xs text-red-200">
                {extractErrorMessage(loadError)}
              </div>
            ) : (
              <>
                {saveError && (
                  <div className="p-3 rounded-xl bg-red-950/40 border border-red-900 text-xs text-red-200 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                    <span>{saveError}</span>
                  </div>
                )}

                {/* Barra de Resumo da Nota Calculada pelo Formulário + Controle de Falta Grave */}
                <div className="p-4 rounded-xl border border-zinc-800/90 bg-[#121216] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block">
                      Nota Calculada pelos Critérios do Formulário
                    </span>
                    <div className="flex items-baseline gap-2.5 mt-1">
                      <span
                        className={`text-3xl font-extrabold font-mono tabular-nums ${
                          fatalTriggered
                            ? "text-red-400"
                            : calculatedStats.effectivePct >=
                              calculatedStats.passingPct
                            ? "text-emerald-400"
                            : "text-amber-300"
                        }`}
                      >
                        {calculatedStats.effectivePct.toFixed(0)}%
                      </span>
                      <span className="text-xs font-mono text-zinc-400">
                        ({calculatedStats.obtainedPoints}/
                        {calculatedStats.maxPossiblePoints} pts nos critérios)
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold ${
                          fatalTriggered
                            ? "bg-red-950/70 text-red-300 border border-red-800/70"
                            : calculatedStats.effectivePct >=
                              calculatedStats.passingPct
                            ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800/60"
                            : "bg-amber-950/60 text-amber-300 border border-amber-800/60"
                        }`}
                      >
                        {fatalTriggered
                          ? "Zerado (Falta Grave)"
                          : calculatedStats.effectivePct >=
                            calculatedStats.passingPct
                          ? "Aprovado"
                          : "Atenção / Reprovado"}
                      </span>
                    </div>
                  </div>

                  {/* Botão de Falta Grave */}
                  <button
                    type="button"
                    onClick={() => {
                      const nextFatal = !fatalTriggered;
                      setFatalTriggered(nextFatal);
                      if (!nextFatal) {
                        setCheckedMap((prev) => {
                          const copy = { ...prev };
                          fatalItems.forEach((fi) => {
                            copy[fi.id] = false;
                          });
                          return copy;
                        });
                      }
                    }}
                    className={`h-9 px-3.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-2 transition-colors shrink-0 ${
                      fatalTriggered
                        ? "border-emerald-700/80 bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-200"
                        : "border-red-900/70 bg-red-950/25 hover:bg-red-950/50 text-red-300"
                    }`}
                  >
                    <ShieldAlert className="h-3.5 w-3.5" />
                    <span>
                      {fatalTriggered
                        ? "Desmarcar Falta Grave (Restaurar Pontos)"
                        : "Marcar Falta Grave (Zerar 0%)"}
                    </span>
                  </button>
                </div>

                {/* Lista Completa do Formulário de Avaliação (Foco Principal) */}
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-zinc-100">
                        Formulário de Critérios ({standardItems.length})
                      </span>
                      <div className="inline-flex items-center rounded-lg bg-[#121216] p-0.5 border border-zinc-800">
                        <button
                          type="button"
                          onClick={() => setFilterMode("ALL")}
                          className={`h-6 px-2.5 rounded-md text-[11px] font-medium transition-colors ${
                            filterMode === "ALL"
                              ? "bg-zinc-100 text-zinc-950 font-semibold"
                              : "text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          Todos ({standardItems.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setFilterMode("UNCHECKED")}
                          className={`h-6 px-2.5 rounded-md text-[11px] font-medium transition-colors ${
                            filterMode === "UNCHECKED"
                              ? "bg-zinc-100 text-zinc-950 font-semibold"
                              : "text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          Desmarcados ({calculatedStats.uncheckedCount})
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setCheckedMap((prev) => {
                            const next = { ...prev };
                            standardItems.forEach((it) => {
                              next[it.id] = true;
                            });
                            return next;
                          });
                        }}
                        className="h-7 px-2.5 rounded-md border border-zinc-800 bg-[#121216] hover:bg-zinc-800 text-[11px] font-mono text-zinc-300 transition-colors"
                      >
                        Marcar Todos
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-800 bg-[#121216] divide-y divide-zinc-800/70 max-h-[340px] overflow-y-auto">
                    {visibleStandardItems.length === 0 ? (
                      <div className="py-8 text-center text-xs text-zinc-500">
                        Todos os critérios estão marcados como conformes (100%).
                      </div>
                    ) : (
                      visibleStandardItems.map((item) => {
                        const isChecked = Boolean(checkedMap[item.id]);
                        const pts =
                          item.points && item.points > 0 ? item.points : 1;
                        const bulletIdx = item.label.indexOf("•");
                        const shortCode =
                          bulletIdx > 0
                            ? item.label.substring(0, bulletIdx).trim()
                            : null;
                        const titleText =
                          bulletIdx > 0
                            ? item.label.substring(bulletIdx + 1).trim()
                            : item.label;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setCheckedMap((prev) => ({
                                ...prev,
                                [item.id]: !prev[item.id],
                              }));
                            }}
                            className={`w-full px-4 py-3 flex items-center justify-between gap-3 text-left transition-colors ${
                              isChecked
                                ? "hover:bg-zinc-900/50"
                                : "bg-red-950/15 hover:bg-red-950/25"
                            }`}
                          >
                            <div className="flex items-start gap-3 min-w-0">
                              <span
                                className={`mt-0.5 h-4 w-4 rounded flex items-center justify-center border shrink-0 transition-colors ${
                                  isChecked
                                    ? "bg-zinc-100 border-zinc-100 text-zinc-950"
                                    : "bg-transparent border-red-500/70 text-transparent"
                                }`}
                              >
                                <Check className="h-3 w-3 stroke-[3]" />
                              </span>

                              <div className="min-w-0 space-y-0.5">
                                <p
                                  className={`text-xs font-medium leading-snug ${
                                    isChecked
                                      ? "text-zinc-100"
                                      : "text-red-200"
                                  }`}
                                >
                                  {titleText}
                                </p>
                                {shortCode && (
                                  <span className="text-[10px] font-mono text-zinc-500 block">
                                    {shortCode} • {item.category}
                                  </span>
                                )}
                              </div>
                            </div>

                            <span
                              className={`px-2.5 py-1 rounded-md text-[11px] font-mono shrink-0 ${
                                isChecked
                                  ? "bg-zinc-100 text-zinc-950 font-semibold"
                                  : "bg-red-950/50 text-red-300 border border-red-900/60"
                              }`}
                            >
                              {isChecked ? `+${pts} pts` : `0/${pts} pts`}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Observações / Justificativa da Revisão */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="edit-eval-feedback"
                    className="text-xs font-medium text-zinc-200 block"
                  >
                    Observações / Justificativa da Revisão
                  </label>
                  <textarea
                    id="edit-eval-feedback"
                    rows={3}
                    value={generalFeedback}
                    onChange={(e) => setGeneralFeedback(e.target.value)}
                    placeholder="Ajuste as observações ou registre o motivo da revisão da nota…"
                    className="w-full p-3 rounded-xl border border-zinc-800 bg-[#121216] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600 resize-y leading-relaxed"
                  />
                </div>
              </>
            )}
          </div>

          {/* Rodapé */}
          <div className="px-5 py-3.5 border-t border-zinc-800/80 bg-[#101014] flex items-center justify-between gap-2.5 shrink-0">
            <span className="text-xs font-mono text-zinc-400">
              Nova Nota:{" "}
              <strong className="text-zinc-100">
                {calculatedStats.effectivePct.toFixed(0)}% (
                {calculatedStats.obtainedPoints}/
                {calculatedStats.maxPossiblePoints} pts)
              </strong>
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-4 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-xs font-medium text-zinc-300 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isLoading || updateMutation.isPending || !evaluation}
                onClick={() => updateMutation.mutate()}
                className="h-9 px-4 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
              >
                {updateMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                <span>
                  {updateMutation.isPending
                    ? "Salvando…"
                    : "Salvar Nova Nota"}
                </span>
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
