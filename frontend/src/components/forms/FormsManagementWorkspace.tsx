"use client";

import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Edit3,
  FileText,
  FolderKanban,
  Minus,
  Plus,
  Power,
  Save,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/context/AuthContext";
import { extractErrorMessage, formsApi } from "@/lib/api";
import { FormTemplate } from "@/types";

interface CleanQuestionDraft {
  uid: string;
  label: string;
  category: string;
  weight: number;
  fatalError: boolean;
}

const SECTOR_OPTIONS = [
  "SAC",
  "Cobrança & Retenção",
  "Suporte N1",
  "Retenção & Ouvidoria",
  "Aquisição",
  "Geral",
];

const CATEGORY_SUGGESTIONS = [
  "Abordagem Inicial",
  "Segurança e LGPD",
  "Condução e Sondagem",
  "Negociação",
  "Encerramento",
  "Geral",
];

function QuestionRowItem({
  index,
  item,
  onUpdate,
  onRemove,
}: {
  index: number;
  item: CleanQuestionDraft;
  onUpdate: (patch: Partial<CleanQuestionDraft>) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={`p-4 rounded-xl border transition-colors ${
        item.fatalError
          ? "border-red-900/50 bg-red-950/10"
          : "border-zinc-800/90 bg-[#0b0b0d]"
      }`}
    >
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        {/* Número da Pergunta */}
        <div className="flex items-center gap-2.5 lg:w-8 shrink-0">
          <span
            className={`h-6 w-6 rounded-md text-xs font-mono font-semibold flex items-center justify-center ${
              item.fatalError
                ? "bg-red-950/60 border border-red-800/70 text-red-300"
                : "bg-zinc-900 border border-zinc-800 text-zinc-400"
            }`}
          >
            {index + 1}
          </span>
          <span className="lg:hidden text-xs font-medium text-zinc-400">
            {item.fatalError ? "Erro Grave (Zera Nota)" : "Pergunta Pontuável"}
          </span>
        </div>

        {/* Campo: Texto da Pergunta */}
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={item.label}
            onChange={(e) => onUpdate({ label: e.target.value })}
            placeholder={
              item.fatalError
                ? "Descreva a falha grave eliminatória (ex: Desligou a chamada indevidamente)..."
                : "Digite a pergunta ou critério a ser avaliado..."
            }
            aria-label={`Texto da pergunta ${index + 1}`}
            className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
          />
        </div>

        {/* Categoria (apenas para itens normais) */}
        {!item.fatalError && (
          <div className="w-full lg:w-44 shrink-0">
            <select
              value={item.category}
              onChange={(e) => onUpdate({ category: e.target.value })}
              aria-label={`Categoria da pergunta ${index + 1}`}
              className="w-full h-9 px-2.5 rounded-lg border border-zinc-800 bg-[#121215] text-xs text-zinc-300 focus:outline-none focus:border-zinc-600"
            >
              {!CATEGORY_SUGGESTIONS.includes(item.category) && (
                <option value={item.category}>{item.category}</option>
              )}
              {CATEGORY_SUGGESTIONS.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Controle de Peso ou Badge de Erro Grave */}
        <div className="flex items-center justify-between lg:justify-end gap-2 shrink-0">
          {item.fatalError ? (
            <button
              type="button"
              onClick={() =>
                onUpdate({ fatalError: false, category: "Geral", weight: 1 })
              }
              title="Clique para converter em pergunta pontuável"
              className="h-9 px-3 rounded-lg border border-red-900/70 bg-red-950/40 text-red-300 text-xs font-mono inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              <span>Erro Grave (0%)</span>
            </button>
          ) : (
            <div className="inline-flex items-center h-9 rounded-lg border border-zinc-800 bg-[#121215] px-1">
              <button
                type="button"
                onClick={() =>
                  onUpdate({ weight: Math.max(1, (item.weight || 1) - 1) })
                }
                aria-label="Diminuir peso"
                className="h-7 w-7 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 flex items-center justify-center"
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className="px-2.5 text-xs font-mono font-semibold text-zinc-100 whitespace-nowrap">
                {item.weight} {item.weight === 1 ? "pt" : "pts"}
              </span>
              <button
                type="button"
                onClick={() =>
                  onUpdate({ weight: Math.min(20, (item.weight || 1) + 1) })
                }
                aria-label="Aumentar peso"
                className="h-7 w-7 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 flex items-center justify-center"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remover pergunta ${index + 1}`}
            className="h-9 w-9 rounded-lg border border-zinc-800 bg-[#121215] hover:border-red-900/60 hover:bg-red-950/30 text-zinc-400 hover:text-red-300 flex items-center justify-center transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function FormsManagementWorkspace({
  defaultCreateNew = false,
}: {
  defaultCreateNew?: boolean;
}) {
  const { isGestor } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<"list" | "editor">(
    defaultCreateNew ? "editor" : "list"
  );
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(
    null
  );

  const [name, setName] = useState("");
  const [sector, setSector] = useState("SAC");
  const [passingScore, setPassingScore] = useState(75);
  const [active, setActive] = useState(true);
  const [questions, setQuestions] = useState<CleanQuestionDraft[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["forms-all"],
    queryFn: () => formsApi.list(false),
    enabled: isGestor,
  });

  // Inicia o editor ZERADO de opções quando for criar um novo formulário
  const startBlankForm = useCallback(() => {
    setEditingTemplateId(null);
    setName("");
    setSector("SAC");
    setPassingScore(75);
    setActive(true);
    setQuestions([]);
    setFormError(null);
    setMode("editor");
  }, []);

  const startEditForm = useCallback((tpl: FormTemplate) => {
    setEditingTemplateId(tpl.id);
    setName(tpl.name);
    setSector(tpl.sector || "SAC");
    setPassingScore(Number(tpl.passingScorePercentage));
    setActive(tpl.active);
    setFormError(null);
    setQuestions(
      tpl.items.map((it, idx) => ({
        uid: `q-${it.id || idx}`,
        label: it.label,
        category: it.category || "Geral",
        weight: it.fatalError ? 0 : it.points || it.weight || 1,
        fatalError: it.fatalError,
      }))
    );
    setMode("editor");
  }, []);

  useEffect(() => {
    if (defaultCreateNew || searchParams.get("action") === "new") {
      startBlankForm();
    }
  }, [defaultCreateNew, searchParams, startBlankForm]);

  const addQuestion = (isFatal: boolean) => {
    setFormError(null);
    setQuestions((prev) => [
      ...prev,
      {
        uid: `q-${Date.now()}-${prev.length}`,
        label: "",
        category: isFatal ? "Erro Grave" : "Geral",
        weight: isFatal ? 0 : 1,
        fatalError: isFatal,
      },
    ]);
  };

  const updateQuestion = (uid: string, patch: Partial<CleanQuestionDraft>) => {
    setQuestions((prev) =>
      prev.map((q) => (q.uid === uid ? { ...q, ...patch } : q))
    );
  };

  const removeQuestion = (uid: string) => {
    setQuestions((prev) => prev.filter((q) => q.uid !== uid));
  };

  const summaryStats = useMemo(() => {
    const standardCount = questions.filter((q) => !q.fatalError).length;
    const fatalCount = questions.filter((q) => q.fatalError).length;
    const totalPoints = questions
      .filter((q) => !q.fatalError)
      .reduce((acc, q) => acc + Math.max(1, Number(q.weight) || 1), 0);
    return { standardCount, fatalCount, totalPoints };
  }, [questions]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) {
        throw new Error("Informe o nome do formulário.");
      }
      const validQuestions = questions.filter((q) => q.label.trim().length > 0);
      if (validQuestions.length === 0) {
        throw new Error(
          "Adicione pelo menos 1 pergunta preenchida ao formulário."
        );
      }
      if (!validQuestions.some((q) => !q.fatalError)) {
        throw new Error(
          "O formulário precisa ter pelo menos 1 pergunta pontuável."
        );
      }

      const payload = {
        name: name.trim(),
        description: `Formulário padronizado do setor ${sector}`,
        sector,
        passingScorePercentage: Number(passingScore),
        active,
        items: validQuestions.map((q, idx) => ({
          label: q.label.trim(),
          description: "",
          category: q.fatalError ? "Erro Grave" : q.category || "Geral",
          fatalError: q.fatalError,
          weight: q.fatalError ? 0 : Math.max(1, Number(q.weight) || 1),
          displayOrder: idx + 1,
        })),
      };

      if (editingTemplateId) {
        return formsApi.update(editingTemplateId, payload);
      }
      return formsApi.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forms-all"] });
      queryClient.invalidateQueries({ queryKey: ["active-forms"] });
      setMode("list");
      setEditingTemplateId(null);
      router.replace("/forms");
    },
    onError: (err) => {
      setFormError(extractErrorMessage(err));
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => formsApi.toggleActive(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forms-all"] });
      queryClient.invalidateQueries({ queryKey: ["active-forms"] });
    },
  });

  if (!isGestor) {
    return (
      <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-300 text-sm">
        Acesso restrito ao perfil de Gestão.
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      {mode === "list" ? (
        /* ====================================================================
           MODO 1: LISTA LIMPA E ORGANIZADA DE FORMULÁRIOS
           ==================================================================== */
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
            <h1 className="text-lg font-bold text-zinc-100 tracking-tight">
              Formulários
            </h1>

            <button
              type="button"
              onClick={startBlankForm}
              className="h-9 px-4 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-zinc-200 text-xs font-semibold inline-flex items-center gap-2 self-start sm:self-auto"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Novo Formulário</span>
            </button>
          </div>

          {isLoading ? (
            <div className="p-10 text-center text-xs text-zinc-500">
              Carregando formulários...
            </div>
          ) : templates.length === 0 ? (
            <div className="p-12 rounded-xl border border-dashed border-zinc-800 bg-[#0b0b0d] text-center space-y-3">
              <FileText className="h-6 w-6 text-zinc-500 mx-auto" />
              <p className="text-xs text-zinc-400">
                Nenhum formulário cadastrado.
              </p>
              <button
                type="button"
                onClick={startBlankForm}
                className="h-9 px-4 rounded-lg bg-zinc-100 text-zinc-950 text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Criar Primeiro Formulário</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="p-4 sm:p-5 rounded-xl border border-zinc-800/90 bg-[#0b0b0d] hover:border-zinc-700 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-zinc-100">
                        {tpl.name}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-zinc-300">
                        {tpl.sector || "Geral"}
                      </span>
                      {!tpl.active && (
                        <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-500">
                          Inativo
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400 font-mono">
                      <span>{tpl.standardItemsCount} perguntas</span>
                      <span>•</span>
                      <span>{tpl.maxPossiblePoints} pts totais</span>
                      {tpl.fatalItemsCount > 0 && (
                        <>
                          <span>•</span>
                          <span>{tpl.fatalItemsCount} erro(s) grave(s)</span>
                        </>
                      )}
                      <span>•</span>
                      <span>
                        Meta: {Number(tpl.passingScorePercentage).toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEditForm(tpl)}
                      className="h-8 px-3.5 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-zinc-200 text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>Editar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleMutation.mutate(tpl.id)}
                      className="h-8 px-3 rounded-lg border border-zinc-800 bg-[#121215] hover:bg-zinc-900 text-xs text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1.5"
                    >
                      <Power className="h-3.5 w-3.5" />
                      <span>{tpl.active ? "Inativar" : "Ativar"}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        /* ====================================================================
           MODO 2: CONSTRUTOR LIMPO E ORGANIZADO (INICIA ZERADO AO CRIAR)
           ==================================================================== */
        <>
          {/* Barra de Topo do Editor */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setMode("list");
                  setEditingTemplateId(null);
                  router.replace("/forms");
                }}
                aria-label="Voltar para a lista de formulários"
                className="h-9 w-9 rounded-lg border border-zinc-800 bg-[#0b0b0d] hover:bg-zinc-900 flex items-center justify-center text-zinc-400 hover:text-zinc-100"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div>
                <h1 className="text-base sm:text-lg font-bold text-zinc-100">
                  {editingTemplateId
                    ? "Editar Formulário"
                    : "Novo Formulário (Em Branco)"}
                </h1>
                <p className="text-xs text-zinc-400">
                  {summaryStats.standardCount} pergunta(s) pontuável(is) •{" "}
                  {summaryStats.totalPoints} pts • {summaryStats.fatalCount}{" "}
                  erro(s) grave(s)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setMode("list");
                  setEditingTemplateId(null);
                  router.replace("/forms");
                }}
                className="h-9 px-3.5 rounded-lg border border-zinc-800 text-xs text-zinc-400 hover:text-zinc-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
                className="h-9 px-4 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-zinc-200 text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                <span>
                  {saveMutation.isPending ? "Salvando..." : "Salvar Formulário"}
                </span>
              </button>
            </div>
          </div>

          {formError && (
            <div className="p-3.5 rounded-xl border border-red-900/80 bg-red-950/30 text-red-200 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{formError}</span>
            </div>
          )}

          {/* Bloco 1: Identificação do Formulário */}
          <div className="p-5 rounded-xl border border-zinc-800/90 bg-[#0b0b0d] grid grid-cols-1 sm:grid-cols-12 gap-4">
            <div className="sm:col-span-6">
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Nome do Formulário *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Monitoria de Atendimento SAC"
                className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
              />
            </div>

            <div className="sm:col-span-4">
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Setor *
              </label>
              <select
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
              >
                {SECTOR_OPTIONS.map((sec) => (
                  <option key={sec} value={sec}>
                    {sec}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Nota Mínima (%)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={passingScore}
                onChange={(e) => setPassingScore(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-600"
              />
            </div>
          </div>

          {/* Bloco 2: Lista de Perguntas (Vem Zerada ao Criar) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                Perguntas & Pesos ({questions.length})
              </h2>
              {questions.length > 0 && (
                <button
                  type="button"
                  onClick={() => setQuestions([])}
                  className="text-[11px] font-mono text-zinc-500 hover:text-zinc-300"
                >
                  Limpar todas
                </button>
              )}
            </div>

            {questions.length === 0 ? (
              <div className="p-10 rounded-xl border border-dashed border-zinc-800 bg-[#0b0b0d] text-center space-y-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-zinc-200">
                    Formulário em branco
                  </p>
                  <p className="text-xs text-zinc-500">
                    Adicione apenas as perguntas e critérios que você deseja
                    avaliar neste formulário.
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => addQuestion(false)}
                    className="h-9 px-4 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-zinc-200 text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Adicionar Pergunta</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => addQuestion(true)}
                    className="h-9 px-4 rounded-lg border border-zinc-800 bg-[#121215] hover:border-red-900/60 text-xs font-medium text-zinc-300 hover:text-red-300 inline-flex items-center gap-1.5"
                  >
                    <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
                    <span>Adicionar Erro Grave</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                {questions.map((q, idx) => (
                  <QuestionRowItem
                    key={q.uid}
                    index={idx}
                    item={q}
                    onUpdate={(patch) => updateQuestion(q.uid, patch)}
                    onRemove={() => removeQuestion(q.uid)}
                  />
                ))}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => addQuestion(false)}
                    className="h-10 rounded-xl border border-dashed border-zinc-700 hover:border-zinc-500 bg-[#0b0b0d] hover:bg-zinc-900/60 text-xs font-medium text-zinc-200 flex items-center justify-center gap-2 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Adicionar Pergunta (+1 pt)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => addQuestion(true)}
                    className="h-10 rounded-xl border border-dashed border-zinc-800 hover:border-red-900/70 bg-[#0b0b0d] hover:bg-red-950/20 text-xs font-medium text-zinc-400 hover:text-red-300 flex items-center justify-center gap-2 transition-colors"
                  >
                    <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
                    <span>Adicionar Regra de Erro Grave (0%)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function FormsStudioPage() {
  return (
    <AppShell>
      <Suspense
        fallback={
          <div className="p-8 text-xs text-zinc-500">
            Carregando Formulários...
          </div>
        }
      >
        <FormsManagementWorkspace />
      </Suspense>
    </AppShell>
  );
}
