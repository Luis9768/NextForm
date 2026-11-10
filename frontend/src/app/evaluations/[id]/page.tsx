"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Lock,
  MessageSquareQuote,
  Pencil,
  PhoneCall,
  ShieldAlert,
  User,
  XCircle,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { CallAudioPlayer } from "@/components/audio/CallAudioPlayer";
import { EditEvaluationScoreModal } from "@/components/evaluations/EditEvaluationScoreModal";
import { useAuth } from "@/context/AuthContext";
import { evaluationsApi, extractErrorMessage } from "@/lib/api";
import {
  formatDateTime,
  formatDuration,
  getEvaluationStatusBadge,
} from "@/lib/utils";

export default function EvaluationDetailPage() {
  const params = useParams<{ id: string }>();
  const evalId = params.id;
  const router = useRouter();
  const { isAnalista, isGestor } = useAuth();
  const [detectedAudioDuration, setDetectedAudioDuration] = React.useState<
    number | null
  >(null);
  const [isEditingModalOpen, setIsEditingModalOpen] = React.useState(false);

  const {
    data: evaluation,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["evaluation-detail", evalId],
    queryFn: () => evaluationsApi.getById(evalId),
    enabled: !!evalId,
  });

  if (isLoading) {
    return (
      <AppShell>
        <div className="p-12 text-center rounded-xl border border-zinc-800 bg-[#101013] text-xs text-zinc-500">
          Carregando espelho da avaliação e ligação vinculada...
        </div>
      </AppShell>
    );
  }

  if (error || !evaluation) {
    return (
      <AppShell>
        <div className="p-6 bg-red-950/40 border border-red-900 rounded-xl text-red-200 text-xs">
          {extractErrorMessage(error)}
        </div>
      </AppShell>
    );
  }

  const badge = getEvaluationStatusBadge(evaluation.status);
  const standardItems = evaluation.items.filter((i) => !i.fatalError);
  const fatalItems = evaluation.items.filter((i) => i.fatalError);
  const customer = evaluation.callRecord.customer;
  const transcricao =
    typeof evaluation.callRecord.metadata?.transcricao === "string"
      ? evaluation.callRecord.metadata.transcricao
          .replace(/^```\n?/, "")
          .replace(/\n?```$/, "")
          .trim()
      : null;

  return (
    <AppShell>
      <div className="space-y-6 pb-16">
        {/* Top bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-zinc-100"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Voltar</span>
          </button>

          <div className="flex items-center gap-2.5">
            {isGestor && (
              <button
                type="button"
                onClick={() => setIsEditingModalOpen(true)}
                className="h-8 px-3 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
                <span>Editar Nota</span>
              </button>
            )}

            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-800 bg-[#101013] text-zinc-400 text-xs font-mono">
              <Lock className="h-3.5 w-3.5 text-zinc-500" />
              <span>
                {isAnalista
                  ? "Visualização do Analista"
                  : "Auditoria Consolidada"}
              </span>
            </div>
          </div>
        </div>

        {/* Fatal Error Alert Banner */}
        {evaluation.fatalErrorTriggered && (
          <div className="p-5 rounded-xl bg-red-950/60 border border-red-800 text-red-100 flex items-start gap-4">
            <AlertTriangle className="h-6 w-6 text-red-400 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wide">
                Avaliação Zerada por Violação de Erro Grave
              </h2>
              <p className="text-xs text-red-200 mt-1">
                Apesar de o analista ter somado{" "}
                <strong>
                  {evaluation.obtainedPoints} de {evaluation.maxPossiblePoints}{" "}
                  pontos ({Number(evaluation.rawScorePercentage).toFixed(1)}%)
                </strong>{" "}
                nos critérios regulares, ao menos um item de{" "}
                <strong>Erro Grave</strong> foi violado na ligação, zerando a
                nota final para <strong>0.0%</strong>.
              </p>
            </div>
          </div>
        )}

        {/* Header Summary Card + Mandatory Linked Call Audio Player */}
        <div className="rounded-xl border border-zinc-800/90 bg-[#101013] p-6 space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-zinc-900 text-zinc-200 font-mono text-xs font-bold border border-zinc-700">
                  <PhoneCall className="h-3 w-3 text-zinc-400" />
                  Ligação Vinculada #{evaluation.callRecord.externalCallId}
                </span>
                <span
                  className={`px-3 py-0.5 rounded-full text-xs ${badge.className}`}
                >
                  {badge.label}
                </span>
              </div>

              <h1 className="text-xl font-bold text-zinc-100">
                {evaluation.formNameSnapshot}{" "}
                <span className="text-xs font-mono font-normal text-zinc-500">
                  (v{evaluation.formVersionSnapshot} • Corte:{" "}
                  {Number(evaluation.passingScoreSnapshot).toFixed(0)}%)
                </span>
              </h1>

              <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400">
                <span className="inline-flex items-center gap-1">
                  <User className="h-3.5 w-3.5 text-zinc-500" />
                  Analista:{" "}
                  <strong className="text-zinc-200">
                    {evaluation.analyst.name}
                  </strong>{" "}
                  ({evaluation.analyst.email})
                </span>
                <span>
                  Avaliador:{" "}
                  <strong className="text-zinc-200">
                    {evaluation.evaluator.name}
                  </strong>
                </span>
                <span>
                  Setor na Época:{" "}
                  <strong className="text-zinc-200">
                    {evaluation.analystSectorSnapshot ||
                      evaluation.analyst.department}
                  </strong>
                </span>
                <span>
                  Data da Avaliação: {formatDateTime(evaluation.evaluatedAt)}
                </span>
                <span>
                  Telefone Cliente:{" "}
                  <strong className="text-zinc-200 font-mono">
                    {evaluation.callRecord.customerIdentifier}
                  </strong>
                </span>
                <span>
                  Duração da Ligação:{" "}
                  <strong className="text-zinc-200 font-mono">
                    {formatDuration(
                      detectedAudioDuration ??
                        evaluation.callRecord.durationSeconds
                    )}
                  </strong>
                </span>
              </div>
            </div>

            {/* Score Box */}
            <div className="flex items-center gap-6 bg-[#0b0b0d] p-4 rounded-xl border border-zinc-800 shrink-0">
              <div className="text-center px-3 border-r border-zinc-800">
                <p className="text-[11px] font-mono uppercase text-zinc-500">
                  Soma de Pesos
                </p>
                <p className="text-2xl font-bold font-mono text-zinc-100 mt-0.5">
                  {evaluation.obtainedPoints} / {evaluation.maxPossiblePoints}
                </p>
                <p className="text-[11px] text-zinc-500 font-mono">
                  Bruto: {Number(evaluation.rawScorePercentage).toFixed(1)}%
                </p>
              </div>

              <div className="text-center px-3">
                <p className="text-[11px] font-mono uppercase text-zinc-500">
                  Nota Final
                </p>
                <p className="text-3xl font-extrabold font-mono text-zinc-50 mt-0.5">
                  {Number(evaluation.finalScorePercentage).toFixed(1)}%
                </p>
                <p className="text-[11px] text-zinc-400 font-medium">
                  {badge.label}
                </p>
              </div>
            </div>
          </div>

          {/* Audio Player(s) of the Linked Call(s) */}
          {Array.isArray(evaluation.callRecord.metadata?.recordings) &&
          (evaluation.callRecord.metadata.recordings as Array<{
            audioUrl: string;
            label?: string;
            fileName?: string;
            durationSeconds?: number;
          }>).length > 1 ? (
            <div className="space-y-2.5">
              {(
                evaluation.callRecord.metadata.recordings as Array<{
                  audioUrl: string;
                  label?: string;
                  fileName?: string;
                  durationSeconds?: number;
                }>
              ).map((rec, idx) => (
                <CallAudioPlayer
                  key={`${rec.audioUrl}_${idx}`}
                  audioUrl={rec.audioUrl}
                  externalCallId={`${rec.label || `Ligação #${idx + 1}`} • ${
                    rec.fileName || evaluation.callRecord.externalCallId
                  }`}
                  durationSeconds={rec.durationSeconds || 180}
                  onDurationDetected={
                    idx === 0 ? setDetectedAudioDuration : undefined
                  }
                />
              ))}
            </div>
          ) : (
            <CallAudioPlayer
              audioUrl={evaluation.callRecord.audioUrl}
              externalCallId={evaluation.callRecord.externalCallId}
              durationSeconds={
                detectedAudioDuration ?? evaluation.callRecord.durationSeconds
              }
              onDurationDetected={setDetectedAudioDuration}
            />
          )}
        </div>

        {/* Manager's General Feedback */}
        {evaluation.generalFeedback && (
          <div className="rounded-xl border border-zinc-800 bg-[#101013] p-5 flex items-start gap-3.5">
            <MessageSquareQuote className="h-5 w-5 text-zinc-400 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                Feedback da Gestão ({evaluation.evaluator.name})
              </h2>
              <p className="text-sm text-zinc-200 mt-1.5 leading-relaxed whitespace-pre-line">
                {evaluation.generalFeedback}
              </p>
            </div>
          </div>
        )}

        {/* Dados do Cliente e Ficha da Venda (13 Campos Directus) */}
        {customer && (
          <div className="rounded-xl border border-zinc-800 bg-[#101013] p-5 space-y-3.5">
            <div className="flex items-center justify-between gap-2 border-b border-zinc-800 pb-2.5">
              <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                Dados do Cliente & Ficha da Venda Vinculada
              </span>
              {customer.proposal && (
                <span className="px-2 py-0.5 rounded bg-[#141418] border border-zinc-800 text-[11px] font-mono text-zinc-200">
                  Proposta #{customer.proposal}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-[#09090b] border border-zinc-800/80">
                <span className="text-[10px] font-mono uppercase text-zinc-500 block">
                  Nome do Cliente
                </span>
                <span className="text-zinc-100 font-semibold mt-0.5 block truncate">
                  {customer.name || "-"}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#09090b] border border-zinc-800/80">
                <span className="text-[10px] font-mono uppercase text-zinc-500 block">
                  CPF / Documento
                </span>
                <span className="text-zinc-100 font-mono mt-0.5 block">
                  {customer.document || "-"}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#09090b] border border-zinc-800/80">
                <span className="text-[10px] font-mono uppercase text-zinc-500 block">
                  Telefone Portabilidade
                </span>
                <span className="text-zinc-100 font-mono mt-0.5 block">
                  {customer.phone || "-"}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#09090b] border border-zinc-800/80">
                <span className="text-[10px] font-mono uppercase text-zinc-500 block">
                  Data da Venda
                </span>
                <span className="text-zinc-100 font-mono mt-0.5 block">
                  {customer.saleDate || "-"}
                </span>
              </div>
              {customer.contractedPlan && (
                <div className="p-2.5 rounded-lg bg-[#09090b] border border-zinc-800/80 sm:col-span-2">
                  <span className="text-[10px] font-mono uppercase text-zinc-500 block">
                    Plano Contratado
                  </span>
                  <span className="text-zinc-100 font-medium mt-0.5 block truncate">
                    {customer.contractedPlan}
                  </span>
                </div>
              )}
              {customer.motherName && (
                <div className="p-2.5 rounded-lg bg-[#09090b] border border-zinc-800/80">
                  <span className="text-[10px] font-mono uppercase text-zinc-500 block">
                    Nome da Mãe
                  </span>
                  <span className="text-zinc-100 mt-0.5 block truncate">
                    {customer.motherName}
                  </span>
                </div>
              )}
              {customer.birthDate && (
                <div className="p-2.5 rounded-lg bg-[#09090b] border border-zinc-800/80">
                  <span className="text-[10px] font-mono uppercase text-zinc-500 block">
                    Data de Nascimento
                  </span>
                  <span className="text-zinc-100 font-mono mt-0.5 block">
                    {customer.birthDate}
                  </span>
                </div>
              )}
              {customer.paymentMethod && (
                <div className="p-2.5 rounded-lg bg-[#09090b] border border-zinc-800/80">
                  <span className="text-[10px] font-mono uppercase text-zinc-500 block">
                    Forma de Pagamento
                  </span>
                  <span className="text-zinc-100 mt-0.5 block">
                    {customer.paymentMethod}
                  </span>
                </div>
              )}
              {customer.dueDate && (
                <div className="p-2.5 rounded-lg bg-[#09090b] border border-zinc-800/80">
                  <span className="text-[10px] font-mono uppercase text-zinc-500 block">
                    Vencimento
                  </span>
                  <span className="text-zinc-100 font-mono mt-0.5 block">
                    Dia {customer.dueDate}
                  </span>
                </div>
              )}
              {customer.earlyPortability && (
                <div className="p-2.5 rounded-lg bg-[#09090b] border border-zinc-800/80">
                  <span className="text-[10px] font-mono uppercase text-zinc-500 block">
                    Portabilidade Antecipada
                  </span>
                  <span className="text-zinc-100 font-mono mt-0.5 block">
                    {customer.earlyPortability}
                  </span>
                </div>
              )}
              {customer.fullAddress && (
                <div className="p-2.5 rounded-lg bg-[#09090b] border border-zinc-800/80 sm:col-span-2 lg:col-span-4">
                  <span className="text-[10px] font-mono uppercase text-zinc-500 block">
                    Endereço Completo
                  </span>
                  <span className="text-zinc-200 mt-0.5 block">
                    {customer.fullAddress}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Transcrição Completa da Chamada (Quando sincronizada do Directus) */}
        {transcricao && (
          <div className="rounded-xl border border-zinc-800 bg-[#101013] p-5 space-y-3">
            <span className="text-xs font-mono uppercase tracking-wider text-zinc-400 block">
              Transcrição da Gravação (Directus)
            </span>
            <pre className="p-4 rounded-lg bg-[#09090b] border border-zinc-800/80 text-xs font-mono text-zinc-300 whitespace-pre-wrap max-h-80 overflow-y-auto leading-relaxed">
              {transcricao}
            </pre>
          </div>
        )}

        {/* Fatal Error Snapshot Items */}
        {fatalItems.length > 0 && (
          <div className="rounded-xl border border-zinc-800 bg-[#101013] overflow-hidden">
            <div className="p-5 border-b border-zinc-800 flex items-center gap-2.5">
              <ShieldAlert className="h-4 w-4 text-red-400" />
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">
                  Verificação de Critérios Eliminatórios (Erro Grave)
                </h2>
              </div>
            </div>

            <div className="divide-y divide-zinc-800/80">
              {fatalItems.map((item) => (
                <div
                  key={item.id}
                  className={`p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    item.checked ? "bg-red-950/30" : ""
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {item.checked ? (
                        <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-zinc-400 shrink-0" />
                      )}
                      <span className="text-xs font-semibold text-zinc-100">
                        {item.label}
                      </span>
                    </div>
                    {item.description && (
                      <p className="text-xs text-zinc-500 pl-6">
                        {item.description}
                      </p>
                    )}
                    {item.observation && (
                      <p className="text-xs text-red-300 pl-6 mt-1">
                        Observação: &ldquo;{item.observation}&rdquo;
                      </p>
                    )}
                  </div>

                  <div className="shrink-0">
                    {item.checked ? (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-red-600 text-white">
                        VIOLADO (NOTA ZERADA)
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono bg-zinc-900 text-zinc-400 border border-zinc-800">
                        Não Violado
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Standard Items Snapshot */}
        <div className="rounded-xl border border-zinc-800 bg-[#101013] overflow-hidden">
          <div className="p-5 border-b border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-100">
              Critérios Avaliados no Snapshot ({standardItems.length} itens)
            </h2>
          </div>

          <div className="divide-y divide-zinc-800/80">
            {standardItems.map((item) => (
              <div
                key={item.id}
                className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    {item.checked ? (
                      <CheckCircle2 className="h-4 w-4 text-zinc-100 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-zinc-600 shrink-0" />
                    )}
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">
                      {item.category}
                    </span>
                    <span className="text-xs font-medium text-zinc-100">
                      {item.label}
                    </span>
                  </div>
                  {item.description && (
                    <p className="text-xs text-zinc-500 pl-6">
                      {item.description}
                    </p>
                  )}
                  {item.observation && (
                    <p className="text-xs text-zinc-300 pl-6 mt-1">
                      Nota do Avaliador: &ldquo;{item.observation}&rdquo;
                    </p>
                  )}
                </div>

                <div className="shrink-0">
                  {item.checked ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-zinc-100 text-zinc-950">
                      +{item.points || 1} pt(s)
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono bg-zinc-900 text-zinc-500 border border-zinc-800">
                      0 / {item.points || 1} pt(s)
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        <EditEvaluationScoreModal
          evaluationId={isEditingModalOpen ? evaluation.id : null}
          onClose={() => setIsEditingModalOpen(false)}
        />
      </div>
    </AppShell>
  );
}
