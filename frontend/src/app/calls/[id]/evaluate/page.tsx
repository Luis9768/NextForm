"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  FileCheck2,
  FolderKanban,
  ShieldAlert,
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
import {
  calculateLiveEvaluationScore,
  formatDateTime,
  formatDuration,
} from "@/lib/utils";

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
    if (call?.evaluationId) {
      router.replace(`/evaluations/${call.evaluationId}`);
    } else if (call?.analyst?.id) {
      router.replace(`/analysts/${call.analyst.id}?callId=${call.id}`);
    }
  }, [call, router]);

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
        nextChecked[item.id] = !item.fatalError;
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

  const liveScore = useMemo(
    () => calculateLiveEvaluationScore(selectedForm, checkedMap),
    [selectedForm, checkedMap]
  );

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
        <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-300 text-sm">
          Acesso restrito ao perfil de Gestão.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-5 pb-16">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="h-8 w-8 rounded-lg border border-zinc-800 bg-[#0b0b0d] flex items-center justify-center text-zinc-400 hover:text-zinc-100 transition-colors"
              aria-label="Voltar"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-base font-bold text-zinc-100">
                Avaliação de Ligação {call ? `#${call.externalCallId}` : ""}
              </h1>
              {call && (
                <p className="text-xs text-zinc-400">
                  Operador: <strong>{call.analyst.name}</strong> •{" "}
                  {formatDateTime(call.callDate)} •{" "}
                  {formatDuration(call.durationSeconds)}
                </p>
              )}
            </div>
          </div>
        </div>

        {loadingCall || loadingForms || !call ? (
          <div className="p-10 text-center rounded-xl border border-zinc-800 bg-[#0b0b0d] text-xs text-zinc-500">
            Carregando dados da ligação...
          </div>
        ) : (
          <>
            <div className="p-4 rounded-xl border border-zinc-800/90 bg-[#0b0b0d] space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <FolderKanban className="h-4 w-4 text-zinc-400 shrink-0" />
                  <select
                    value={selectedFormId}
                    onChange={(e) => setSelectedFormId(e.target.value)}
                    aria-label="Selecionar formulário"
                    className="h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs font-medium text-zinc-100 focus:outline-none focus:border-zinc-600 max-w-md w-full truncate"
                  >
                    {forms.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.sector || "Geral"} • {f.maxPossiblePoints}{" "}
                        pts)
                      </option>
                    ))}
                  </select>
                  <Link
                    href="/forms"
                    className="h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] hover:bg-zinc-900 text-xs text-zinc-300 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <span>Editar Formulários</span>
                  </Link>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <span className="text-xs font-mono text-zinc-400">
                    Nota_Final: {liveScore.obtainedPoints}/
                    {liveScore.maxPossiblePoints} pts
                  </span>
                  <span
                    className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold border ${
                      liveScore.status === "APROVADO"
                        ? "bg-emerald-950/50 text-emerald-300 border-emerald-800/80"
                        : liveScore.status === "ZERADO_ERRO_GRAVE"
                        ? "bg-red-950/70 text-red-200 border-red-800"
                        : "bg-zinc-900 text-zinc-200 border-zinc-800"
                    }`}
                  >
                    {liveScore.finalPercentage.toFixed(0)}
                  </span>
                </div>
              </div>

              <CallAudioPlayer
                audioUrl={call.audioUrl}
                externalCallId={call.externalCallId}
                durationSeconds={call.durationSeconds}
              />
            </div>

            {submitError && (
              <div className="p-3 rounded-xl border border-red-900/80 bg-red-950/40 text-red-200 text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                <span>{submitError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              <div className="lg:col-span-8 space-y-5">
                <div className="space-y-2">
                  {standardItems.map((item) => {
                    const isChecked = !!checkedMap[item.id];
                    return (
                      <div
                        key={item.id}
                        className={`rounded-xl border transition-all p-3.5 flex flex-col gap-2 ${
                          isChecked
                            ? "border-zinc-600 bg-[#141418]"
                            : "border-amber-900/50 bg-[#0b0b0d]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <label className="flex items-center gap-3 cursor-pointer flex-1 select-none min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) =>
                                setCheckedMap((prev) => ({
                                  ...prev,
                                  [item.id]: e.target.checked,
                                }))
                              }
                              className="h-4 w-4 rounded border-zinc-600 text-zinc-100 focus:ring-0 cursor-pointer shrink-0"
                            />
                            <div className="min-w-0">
                              <span className="text-[10px] font-mono text-zinc-500 block">
                                {item.category}
                              </span>
                              <span className="text-xs font-medium text-zinc-100 leading-snug block">
                                {item.label}
                              </span>
                            </div>
                          </label>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold whitespace-nowrap ${
                              isChecked
                                ? "bg-zinc-100 text-zinc-950"
                                : "bg-red-950/60 text-red-300 border border-red-900/60"
                            }`}
                          >
                            {isChecked
                              ? `${item.points || 1} pts`
                              : `0 / ${item.points || 1} pts`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {fatalItems.length > 0 && (
                  <div className="space-y-2.5 p-4 rounded-xl border border-zinc-800/90 bg-[#0b0b0d]">
                    <span className="text-xs font-mono uppercase tracking-wider text-red-400/90 flex items-center gap-1.5">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      <span>Falta Grave (Zera Nota_Final = 0)</span>
                    </span>
                    <div className="space-y-2">
                      {fatalItems.map((item) => {
                        const isViolated = !!checkedMap[item.id];
                        return (
                          <div
                            key={item.id}
                            className={`rounded-xl border transition-all p-3.5 ${
                              isViolated
                                ? "border-red-600 bg-red-950/30"
                                : "border-zinc-800/90 bg-[#121215]"
                            }`}
                          >
                            <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
                              <div className="flex items-center gap-3 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isViolated}
                                  onChange={(e) =>
                                    setCheckedMap((prev) => ({
                                      ...prev,
                                      [item.id]: e.target.checked,
                                    }))
                                  }
                                  className="h-4 w-4 rounded border-zinc-600 text-red-600 focus:ring-0 cursor-pointer shrink-0"
                                />
                                <span className="text-xs font-medium text-zinc-100 leading-snug">
                                  {item.label}
                                </span>
                              </div>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-mono shrink-0 ${
                                  isViolated
                                    ? "bg-red-600 text-white font-bold"
                                    : "bg-zinc-900 text-zinc-500 border border-zinc-800"
                                }`}
                              >
                                {isViolated ? "FALTA GRAVE" : "Inativo"}
                              </span>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="block text-xs font-mono uppercase tracking-wider text-zinc-400">
                    Observações / Resumo do Atendimento
                  </label>
                  <textarea
                    rows={4}
                    value={generalFeedback}
                    onChange={(e) => setGeneralFeedback(e.target.value)}
                    placeholder="Observações gerais da avaliação..."
                    className="w-full p-3.5 rounded-xl border border-zinc-800 bg-[#0b0b0d] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
                  />
                </div>
              </div>

              <div className="lg:col-span-4 rounded-xl border border-zinc-800/90 bg-[#0b0b0d] p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <span className="text-xs font-semibold text-zinc-200 font-mono">
                    Nota_Final
                  </span>
                  <span className="text-xs font-mono text-zinc-500">
                    Meta:{" "}
                    {selectedForm
                      ? Number(selectedForm.passingScorePercentage).toFixed(0)
                      : 80}
                    %
                  </span>
                </div>

                {liveScore.fatalTriggered && (
                  <div className="p-3 rounded-lg bg-red-950/60 border border-red-800 text-red-200 text-xs flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                    <span>Zerado por Falta Grave</span>
                  </div>
                )}

                <div className="py-5 text-center rounded-xl border border-zinc-800 bg-[#121215]">
                  <p className="text-4xl font-bold tracking-tight text-zinc-50 font-mono">
                    {liveScore.finalPercentage.toFixed(0)}
                  </p>
                  <p className="text-xs text-zinc-400 font-mono mt-1.5">
                    {liveScore.obtainedPoints} / {liveScore.maxPossiblePoints}{" "}
                    pts ({liveScore.finalPercentage.toFixed(1)}%)
                  </p>
                </div>

                <button
                  type="button"
                  disabled={submitMutation.isPending || !selectedForm}
                  onClick={() => submitMutation.mutate()}
                  className="w-full h-10 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-zinc-200 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <FileCheck2 className="h-4 w-4" />
                  <span>
                    {submitMutation.isPending
                      ? "Salvando..."
                      : "Publicar Monitoria"}
                  </span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
