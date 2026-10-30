"use client";

import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Check,
  CheckCircle2,
  Clock,
  GitBranch,
  Maximize2,
  Minus,
  Play,
  Plus,
  Power,
  Terminal,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { studioApi } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { FlowExecutionResult, StudioFlow } from "@/types";

export function DirectusFlowsCanvasView() {
  const queryClient = useQueryClient();

  const { data: flows = [], isLoading } = useQuery({
    queryKey: ["studio-flows"],
    queryFn: studioApi.listFlows,
  });

  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [canvasZoom, setCanvasZoom] = useState(100);
  const [isLogsDrawerOpen, setIsLogsDrawerOpen] = useState(false);
  const [lastExecution, setLastExecution] =
    useState<FlowExecutionResult | null>(null);
  const [logStepTab, setLogStepTab] = useState<"payload" | "options">(
    "payload"
  );

  // Modal Criar Novo Fluxo
  const [isCreateFlowOpen, setIsCreateFlowOpen] = useState(false);
  const [flowName, setFlowName] = useState("");
  const [flowDesc, setFlowDesc] = useState("");
  const [triggerType, setTriggerType] = useState("EVENT_HOOK");
  const [triggerCollection, setTriggerCollection] = useState(
    "evaluations.items.create"
  );
  const [conditionSummary, setConditionSummary] = useState(
    '{ "finalScorePercentage": { "_lt": 75 } }'
  );
  const [actionSummary, setActionSummary] = useState(
    "POST https://n8n.empresa.com/webhook/alerta-qualidade"
  );

  // Drawer Adicionar Operação
  const [isAddOpOpen, setIsAddOpOpen] = useState(false);
  const [opName, setOpName] = useState("");
  const [opType, setOpType] = useState("condition");
  const [opConfig, setOpConfig] = useState(
    '{ "fatalErrorTriggered": { "_eq": true } }'
  );

  useEffect(() => {
    if (!selectedFlowId && flows.length > 0) {
      setSelectedFlowId(flows[0].id);
    }
  }, [flows, selectedFlowId]);

  const activeFlow: StudioFlow | null =
    flows.find((f) => f.id === selectedFlowId) || flows[0] || null;

  const createFlowMutation = useMutation({
    mutationFn: () =>
      studioApi.createFlow({
        name: flowName.trim() || "Novo Fluxo de Automação QA",
        description:
          flowDesc.trim() || "Automação baseada em eventos de avaliação.",
        triggerType,
        triggerCollection,
        conditionSummary,
        actionSummary,
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["studio-flows"] });
      setIsCreateFlowOpen(false);
      setFlowName("");
      setFlowDesc("");
      setSelectedFlowId(created.id);
    },
  });

  const toggleFlowMutation = useMutation({
    mutationFn: (id: string) => studioApi.toggleFlow(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studio-flows"] });
    },
  });

  const triggerFlowMutation = useMutation({
    mutationFn: (id: string) => studioApi.triggerFlow(id),
    onSuccess: (res) => {
      setLastExecution(res);
      setIsLogsDrawerOpen(true);
      queryClient.invalidateQueries({ queryKey: ["studio-flows"] });
      queryClient.invalidateQueries({ queryKey: ["studio-activity"] });
    },
  });

  const addOperationMutation = useMutation({
    mutationFn: () => {
      if (!activeFlow) throw new Error("Fluxo não selecionado");
      return studioApi.addFlowOperation(activeFlow.id, {
        name: opName.trim() || `Operação (${opType})`,
        type: opType,
        configSummary: opConfig.trim() || "{}",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studio-flows"] });
      setIsAddOpOpen(false);
      setOpName("");
    },
  });

  const deleteOperationMutation = useMutation({
    mutationFn: ({ flowId, opId }: { flowId: string; opId: string }) =>
      studioApi.deleteFlowOperation(flowId, opId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studio-flows"] });
    },
  });

  return (
    <div className="space-y-5">
      {/* Cabeçalho de Fluxos de Automação */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-500">
            <span>Configurações</span>
            <span>/</span>
            <span className="text-zinc-300">Fluxos de Automação</span>
            {activeFlow && (
              <>
                <span>/</span>
                <span className="text-zinc-100 font-semibold">
                  {activeFlow.name}
                </span>
              </>
            )}
          </div>
          <h1 className="text-lg font-bold text-zinc-100 flex items-center gap-2 mt-0.5">
            <Zap className="h-4 w-4 text-zinc-300" />
            <span>Fluxos de Automação & Gatilhos de Qualidade</span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeFlow && (
            <>
              <button
                type="button"
                onClick={() => triggerFlowMutation.mutate(activeFlow.id)}
                disabled={triggerFlowMutation.isPending}
                className="h-9 px-3.5 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-zinc-200 text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>
                  {triggerFlowMutation.isPending
                    ? "Executando..."
                    : "Executar Fluxo"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setIsAddOpOpen(true)}
                className="h-9 px-3 rounded-lg border border-zinc-800 bg-[#101013] hover:bg-zinc-900 text-xs text-zinc-200 font-medium inline-flex items-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Adicionar Operação</span>
              </button>

              <button
                type="button"
                onClick={() => setIsLogsDrawerOpen(true)}
                className="h-9 px-3 rounded-lg border border-zinc-800 bg-[#101013] hover:bg-zinc-900 text-xs text-zinc-200 font-mono inline-flex items-center gap-1.5"
              >
                <Terminal className="h-3.5 w-3.5 text-emerald-400" />
                <span>Execuções ({activeFlow.totalExecutions})</span>
              </button>

              <button
                type="button"
                onClick={() => toggleFlowMutation.mutate(activeFlow.id)}
                className="h-9 px-3 rounded-lg border border-zinc-800 bg-[#101013] hover:bg-zinc-900 text-xs text-zinc-300 inline-flex items-center gap-1.5"
              >
                <Power className="h-3.5 w-3.5" />
                <span>
                  {activeFlow.status === "ACTIVE" ? "Ativo" : "Pausado"}
                </span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setIsCreateFlowOpen(true)}
            className="h-9 px-3.5 rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-100 font-semibold inline-flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Novo Fluxo</span>
          </button>
        </div>
      </div>

      {/* Seletor de Fluxos */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {flows.map((flow) => {
          const isSelected = activeFlow?.id === flow.id;
          return (
            <button
              key={flow.id}
              type="button"
              onClick={() => setSelectedFlowId(flow.id)}
              className={`px-3.5 py-2 rounded-xl border text-left transition-all shrink-0 flex items-center gap-2.5 ${
                isSelected
                  ? "bg-zinc-100 text-zinc-950 border-zinc-100 font-semibold"
                  : "bg-[#101013] text-zinc-300 border-zinc-800 hover:border-zinc-700"
              }`}
            >
              <Zap
                className={`h-3.5 w-3.5 ${
                  isSelected ? "text-zinc-950" : "text-zinc-400"
                }`}
              />
              <span className="text-xs whitespace-nowrap">{flow.name}</span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                  isSelected
                    ? "bg-zinc-950/15 text-zinc-950"
                    : "bg-zinc-900 text-zinc-400"
                }`}
              >
                {flow.triggerType}
              </span>
            </button>
          );
        })}
      </div>

      {/* CANVAS INTERATIVO PONTILHADO DE FLUXOS */}
      {isLoading || !activeFlow ? (
        <div className="h-96 rounded-2xl border border-zinc-800 bg-[#0b0b0d] flex items-center justify-center text-xs text-zinc-500">
          Carregando Canvas de Automação...
        </div>
      ) : (
        <div className="relative rounded-2xl border border-zinc-800/90 bg-[#09090b] bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:20px_20px] min-h-[470px] flex flex-col justify-between overflow-hidden">
          {/* Barra Superior do Canvas */}
          <div className="p-4 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/60 bg-[#0b0b0d]/90 backdrop-blur">
            <div className="flex items-center gap-2.5">
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                  activeFlow.status === "ACTIVE"
                    ? "bg-zinc-100 text-zinc-950"
                    : "bg-zinc-900 text-zinc-500 border border-zinc-800"
                }`}
              >
                {activeFlow.status === "ACTIVE" ? "ATIVO" : "PAUSADO"}
              </span>
              <span className="text-xs font-semibold text-zinc-100">
                {activeFlow.description}
              </span>
            </div>
            <div className="flex items-center gap-4 text-[11px] font-mono text-zinc-400">
              <span className="flex items-center gap-1">
                <Activity className="h-3.5 w-3.5" /> Execuções:{" "}
                <strong className="text-zinc-200">
                  {activeFlow.totalExecutions}
                </strong>
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> Última:{" "}
                {formatDateTime(activeFlow.lastExecutedAt)}
              </span>
            </div>
          </div>

          {/* Grafo Central de Nós */}
          <div className="flex-1 overflow-x-auto p-8 flex items-center">
            <div
              className="flex items-start gap-4 min-w-max transition-transform origin-left"
              style={{ transform: `scale(${canvasZoom / 100})` }}
            >
              {/* 1. CARD DO GATILHO (TRIGGER) */}
              <div className="w-72 rounded-xl border-2 border-zinc-700 bg-[#111115] shadow-2xl overflow-hidden shrink-0">
                <div className="px-3.5 py-2.5 bg-[#18181d] border-b border-zinc-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-md bg-zinc-100 text-zinc-950 flex items-center justify-center">
                      <Zap className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-zinc-100">Gatilho</p>
                      <p className="text-[10px] font-mono text-zinc-400">
                        $gatilho
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-900 border border-zinc-700 text-zinc-200">
                    {activeFlow.triggerType}
                  </span>
                </div>

                <div className="p-3.5 space-y-2">
                  <div className="text-[11px] font-mono text-zinc-400">
                    Escopo / Evento Monitorado:
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#09090b] border border-zinc-800 font-mono text-xs text-zinc-100 break-all">
                    {activeFlow.triggerCollection}
                  </div>
                </div>

                <div className="px-3.5 py-2 border-t border-zinc-800/80 bg-[#0d0d10] flex items-center justify-between text-[10px] font-mono text-zinc-400">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <Check className="h-3 w-3" /> Sucesso
                  </span>
                  <span>Próximo Nó →</span>
                </div>
              </div>

              {/* 2. CADEIA DE OPERAÇÕES */}
              {activeFlow.operations.map((op, idx) => (
                <React.Fragment key={op.id}>
                  {/* Linha Conectora */}
                  <div className="flex items-center self-center pt-2">
                    <div className="w-6 h-0.5 bg-zinc-700" />
                    <div className="h-5 w-5 rounded-full border border-zinc-700 bg-[#141418] flex items-center justify-center text-emerald-400">
                      <Check className="h-3 w-3" />
                    </div>
                    <div className="w-6 h-0.5 bg-zinc-700" />
                  </div>

                  {/* Card da Operação */}
                  <div className="w-72 rounded-xl border border-zinc-800 hover:border-zinc-600 bg-[#111115] shadow-2xl overflow-hidden shrink-0 transition-colors">
                    <div className="px-3.5 py-2.5 bg-[#16161b] border-b border-zinc-800 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-6 w-6 rounded-md bg-zinc-800 text-zinc-200 flex items-center justify-center shrink-0">
                          <GitBranch className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-zinc-100 truncate">
                            {op.name}
                          </p>
                          <p className="text-[10px] font-mono text-zinc-400">
                            etapa_{idx + 1}_{op.type}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-300 uppercase">
                          {op.type}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            deleteOperationMutation.mutate({
                              flowId: activeFlow.id,
                              opId: op.id,
                            })
                          }
                          title="Remover nó de operação"
                          className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="p-3.5 space-y-2">
                      <div className="text-[11px] font-mono text-zinc-400">
                        Configuração / Regra da Etapa:
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#09090b] border border-zinc-800 font-mono text-[11px] text-zinc-200 break-words line-clamp-3">
                        {op.configSummary}
                      </div>
                    </div>

                    {/* Portas de Sucesso ✓ e Falha ✕ */}
                    <div className="px-3.5 py-2 border-t border-zinc-800/80 bg-[#0d0d10] flex items-center justify-between text-[10px] font-mono">
                      <span className="flex items-center gap-1 text-emerald-400">
                        <Check className="h-3 w-3" /> Sucesso
                      </span>
                      <span className="flex items-center gap-1 text-zinc-500">
                        <X className="h-3 w-3" /> Falha
                      </span>
                    </div>
                  </div>
                </React.Fragment>
              ))}

              {/* 3. CONECTOR ADICIONAR PRÓXIMA OPERAÇÃO (+) */}
              <div className="flex items-center self-center pt-2">
                <div className="w-8 h-0.5 bg-zinc-700" />
                <button
                  type="button"
                  onClick={() => setIsAddOpOpen(true)}
                  title="Adicionar nova Operação ao Fluxo"
                  className="h-10 px-3.5 rounded-xl border border-dashed border-zinc-700 hover:border-zinc-400 bg-[#111115] hover:bg-zinc-900 text-xs font-mono text-zinc-200 inline-flex items-center gap-1.5 shadow-lg transition-all"
                >
                  <Plus className="h-4 w-4" />
                  <span>Adicionar Operação</span>
                </button>
              </div>
            </div>
          </div>

          {/* Barra Inferior de Controle de Zoom */}
          <div className="p-3 border-t border-zinc-800/60 bg-[#0b0b0d]/90 flex items-center justify-between text-xs font-mono text-zinc-400">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCanvasZoom((z) => Math.max(70, z - 10))}
                className="p-1.5 rounded hover:bg-zinc-800 text-zinc-300"
                title="Reduzir Zoom"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="px-2 text-[11px]">{canvasZoom}%</span>
              <button
                type="button"
                onClick={() => setCanvasZoom((z) => Math.min(120, z + 10))}
                className="p-1.5 rounded hover:bg-zinc-800 text-zinc-300"
                title="Aumentar Zoom"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setCanvasZoom(100)}
                className="px-2 py-1 rounded hover:bg-zinc-800 text-[11px] text-zinc-300 inline-flex items-center gap-1 ml-1"
              >
                <Maximize2 className="h-3 w-3" /> Ajustar
              </button>
            </div>

            <div className="flex items-center gap-2 text-[11px]">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              <span>Motor de Automação NEXFORM Ativo</span>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER: ADICIONAR NÓ DE OPERAÇÃO */}
      <AnimatePresence>
        {isAddOpOpen && activeFlow && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end"
            onClick={() => setIsAddOpOpen(false)}
          >
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg bg-[#0e0e11] border-l border-zinc-800 h-full overflow-y-auto p-6 space-y-5 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
                <div>
                  <span className="text-[11px] font-mono text-zinc-500">
                    {activeFlow.name}
                  </span>
                  <h3 className="text-base font-bold text-zinc-100">
                    Adicionar Nó de Operação
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddOpOpen(false)}
                  className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Nome da Etapa / Operação *
                  </label>
                  <input
                    type="text"
                    value={opName}
                    onChange={(e) => setOpName(e.target.value)}
                    placeholder="ex: Validar Nota de Corte >= 80%"
                    className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs text-zinc-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Tipo de Operação
                  </label>
                  <select
                    value={opType}
                    onChange={(e) => setOpType(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs font-mono text-zinc-200"
                  >
                    <option value="condition">Condição (Filtro JSON)</option>
                    <option value="request">Requisição HTTP / Webhook</option>
                    <option value="notification">
                      Enviar Notificação Interna
                    </option>
                    <option value="read-data">Ler Registros de Coleção</option>
                    <option value="item-create">Criar Registro</option>
                    <option value="item-update">Atualizar Registro</option>
                    <option value="transform">Transformar Payload JSON</option>
                    <option value="exec-script">
                      Executar Script Customizado
                    </option>
                    <option value="log">Registrar no Log</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Opções da Operação / Regra JSON
                  </label>
                  <textarea
                    rows={5}
                    value={opConfig}
                    onChange={(e) => setOpConfig(e.target.value)}
                    className="w-full p-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs font-mono text-zinc-100"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsAddOpOpen(false)}
                  className="h-9 px-4 rounded-lg border border-zinc-800 text-xs text-zinc-400"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={addOperationMutation.isPending}
                  onClick={() => addOperationMutation.mutate()}
                  className="h-9 px-5 rounded-lg bg-zinc-100 text-zinc-950 font-semibold text-xs"
                >
                  {addOperationMutation.isPending
                    ? "Adicionando..."
                    : "Salvar Operação"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DRAWER: HISTÓRICO DE EXECUÇÃO DO FLUXO */}
      <AnimatePresence>
        {isLogsDrawerOpen && activeFlow && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end"
            onClick={() => setIsLogsDrawerOpen(false)}
          >
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xl bg-[#0e0e11] border-l border-zinc-800 h-full overflow-y-auto p-6 space-y-5 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
                <div>
                  <span className="text-[11px] font-mono uppercase text-zinc-500">
                    Histórico de Execuções do Fluxo
                  </span>
                  <h3 className="text-base font-bold text-zinc-100">
                    {activeFlow.name}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => triggerFlowMutation.mutate(activeFlow.id)}
                    className="h-8 px-3 rounded-lg bg-zinc-100 text-zinc-950 text-xs font-semibold inline-flex items-center gap-1"
                  >
                    <Play className="h-3 w-3 fill-current" />
                    <span>Executar Agora</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsLogsDrawerOpen(false)}
                    className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1 p-1 rounded-lg bg-[#09090b] border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setLogStepTab("payload")}
                  className={`flex-1 py-1.5 rounded-md text-xs font-mono ${
                    logStepTab === "payload"
                      ? "bg-zinc-100 text-zinc-950 font-semibold"
                      : "text-zinc-400"
                  }`}
                >
                  Resultado da Etapa (Payload)
                </button>
                <button
                  type="button"
                  onClick={() => setLogStepTab("options")}
                  className={`flex-1 py-1.5 rounded-md text-xs font-mono ${
                    logStepTab === "options"
                      ? "bg-zinc-100 text-zinc-950 font-semibold"
                      : "text-zinc-400"
                  }`}
                >
                  Parâmetros de Execução
                </button>
              </div>

              {lastExecution ? (
                <div className="space-y-3">
                  <div className="p-3 rounded-xl border border-zinc-800 bg-[#101013] flex items-center justify-between text-xs font-mono">
                    <span className="text-emerald-400 font-bold">
                      STATUS: {lastExecution.status}
                    </span>
                    <span className="text-zinc-400">
                      Duração Total: {lastExecution.durationMs} ms
                    </span>
                  </div>

                  {lastExecution.steps.map((st, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl border border-zinc-800 bg-[#101013] space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="font-bold text-zinc-100">
                          {idx + 1}. {st.stepName}
                        </span>
                        <span className="text-emerald-400">
                          {st.durationMs} ms
                        </span>
                      </div>
                      <pre className="p-3 rounded-lg bg-[#09090b] border border-zinc-800 text-[11px] font-mono text-zinc-300 overflow-x-auto">
                        {logStepTab === "payload"
                          ? JSON.stringify(
                              {
                                etapa: st.stepName,
                                operacao: st.operationType,
                                status: st.status,
                                retorno: st.outputDetail,
                              },
                              null,
                              2
                            )
                          : JSON.stringify(
                              {
                                flowId: lastExecution.flowId,
                                executadoEm: lastExecution.executedAt,
                                duracaoMs: st.durationMs,
                              },
                              null,
                              2
                            )}
                      </pre>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 rounded-xl border border-zinc-800 bg-[#101013] text-center space-y-3">
                  <p className="text-xs text-zinc-400">
                    Clique em <strong>Executar Agora</strong> para disparar este
                    Fluxo e inspecionar o resultado de cada etapa em tempo real.
                  </p>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL: CRIAR NOVO FLUXO */}
      <AnimatePresence>
        {isCreateFlowOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setIsCreateFlowOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-[#101013] p-6 space-y-5 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="text-base font-bold text-zinc-100">
                  Criar Novo Fluxo de Automação
                </h3>
                <button
                  type="button"
                  onClick={() => setIsCreateFlowOpen(false)}
                  className="text-zinc-400 hover:text-zinc-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Nome do Fluxo *
                  </label>
                  <input
                    type="text"
                    value={flowName}
                    onChange={(e) => setFlowName(e.target.value)}
                    placeholder="Ex: Notificar Supervisão Nota < 70%"
                    className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs text-zinc-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Descrição
                  </label>
                  <input
                    type="text"
                    value={flowDesc}
                    onChange={(e) => setFlowDesc(e.target.value)}
                    placeholder="Descrição da regra de automação..."
                    className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs text-zinc-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Tipo de Gatilho
                  </label>
                  <select
                    value={triggerType}
                    onChange={(e) => setTriggerType(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs font-mono text-zinc-200"
                  >
                    <option value="EVENT_HOOK">Evento de Banco (Hook)</option>
                    <option value="WEBHOOK">Webhook Externo</option>
                    <option value="SCHEDULE_CRON">Agendamento (CRON)</option>
                    <option value="MANUAL">Disparo Manual</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Coleção / Evento Alvo
                  </label>
                  <select
                    value={triggerCollection}
                    onChange={(e) => setTriggerCollection(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs font-mono text-zinc-200"
                  >
                    <option value="evaluations.items.create">
                      evaluations.items.create (Nova Avaliação)
                    </option>
                    <option value="call_records.items.create">
                      call_records.items.create (Nova Ligação)
                    </option>
                    <option value="evaluation_form_templates.items.update">
                      evaluation_form_templates.items.update (Formulário)
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Condição de Filtro JSON
                  </label>
                  <input
                    type="text"
                    value={conditionSummary}
                    onChange={(e) => setConditionSummary(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs font-mono text-zinc-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Ação Final / Webhook
                  </label>
                  <input
                    type="text"
                    value={actionSummary}
                    onChange={(e) => setActionSummary(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs font-mono text-zinc-200"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateFlowOpen(false)}
                  className="h-9 px-4 rounded-lg border border-zinc-800 text-xs text-zinc-400"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={createFlowMutation.isPending}
                  onClick={() => createFlowMutation.mutate()}
                  className="h-9 px-5 rounded-lg bg-zinc-100 text-zinc-950 font-semibold text-xs"
                >
                  {createFlowMutation.isPending
                    ? "Salvando..."
                    : "Salvar Fluxo"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
