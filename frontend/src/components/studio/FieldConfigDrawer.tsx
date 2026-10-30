"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  Award,
  Check,
  Columns2,
  Copy,
  Maximize2,
  Minus,
  Plus,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface EditableFieldData {
  uid: string;
  enabled?: boolean;
  fieldKey: string;
  label: string;
  description: string;
  group?: string;
  category?: string;
  width: "half" | "full";
  weight: number;
  fatalError: boolean;
}

interface FieldConfigDrawerProps {
  field: EditableFieldData | null;
  showEnabledToggle?: boolean;
  onClose: () => void;
  onUpdate: (patch: Partial<EditableFieldData>) => void;
  onToggleEnabled?: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const PRESET_WEIGHTS = [1, 2, 3, 5, 10];
const PRESET_CATEGORIES = [
  "Abertura",
  "Segurança e LGPD",
  "Condução",
  "Negociação",
  "Encerramento",
];

export function FieldConfigDrawer({
  field,
  showEnabledToggle = true,
  onClose,
  onUpdate,
  onToggleEnabled,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
}: FieldConfigDrawerProps) {
  const safeWeight =
    field && Number.isFinite(field.weight) && field.weight > 0
      ? field.weight
      : 1;

  const currentCategory = field?.group || field?.category || "Geral";

  return (
    <AnimatePresence>
      {field && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] flex justify-end"
          onClick={onClose}
        >
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-[#0f0f12] border-l border-zinc-800/90 h-full flex flex-col justify-between shadow-2xl"
          >
            {/* Top Header */}
            <div className="px-6 py-5 border-b border-zinc-800/80 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 block">
                  Configuração do Critério
                </span>
                <h2 className="text-base font-semibold text-zinc-100 mt-0.5">
                  Personalizar Pergunta e Peso
                </h2>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="h-8 w-8 rounded-md border border-zinc-800 bg-zinc-900/80 hover:bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-zinc-100 transition-colors"
                title="Fechar painel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
              {/* 1. Incluir / Ocultar na Avaliação Atual */}
              {showEnabledToggle && onToggleEnabled && (
                <div
                  onClick={onToggleEnabled}
                  className="p-4 rounded-lg border border-zinc-800/90 bg-[#141418] hover:border-zinc-700 cursor-pointer transition-colors flex items-center justify-between gap-4"
                >
                  <div>
                    <p className="text-sm font-medium text-zinc-100">
                      Usar esta pergunta nesta avaliação
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Desative caso este critério não se aplique a esta chamada
                    </p>
                  </div>

                  <div
                    className={cn(
                      "px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0",
                      field.enabled
                        ? "bg-zinc-100 text-zinc-950"
                        : "bg-zinc-900 text-zinc-400 border border-zinc-800"
                    )}
                  >
                    {field.enabled && <Check className="h-3.5 w-3.5" />}
                    <span>{field.enabled ? "Incluído" : "Oculto"}</span>
                  </div>
                </div>
              )}

              {/* 2. Pergunta Principal */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-zinc-300">
                  Pergunta / Critério que será avaliado
                </label>
                <input
                  type="text"
                  value={field.label}
                  onChange={(e) => onUpdate({ label: e.target.value })}
                  placeholder="Ex: Confirmou dados positivos de titularidade..."
                  className="w-full h-10 px-3.5 rounded-lg border border-zinc-800 bg-[#141418] text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                />
              </div>

              {/* 3. Orientação / Instrução */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-zinc-300">
                  Orientação para a avaliação{" "}
                  <span className="text-zinc-500 font-normal">(Opcional)</span>
                </label>
                <textarea
                  rows={2}
                  value={field.description}
                  onChange={(e) => onUpdate({ description: e.target.value })}
                  placeholder="Explique o que deve ser observado na gravação para marcar este item..."
                  className="w-full p-3.5 rounded-lg border border-zinc-800 bg-[#141418] text-xs text-zinc-200 placeholder-zinc-600 leading-relaxed focus:outline-none focus:border-zinc-500 transition-colors"
                />
              </div>

              {/* 4. Tipo de Regra (2 Cartões Visuais Claros em vez de Select cortado) */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-zinc-300">
                  Como este item impacta a nota?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdate({
                        fatalError: false,
                        weight: Math.max(1, safeWeight),
                      })
                    }
                    className={cn(
                      "p-3.5 rounded-lg border text-left transition-all space-y-1",
                      !field.fatalError
                        ? "border-zinc-200 bg-[#18181d]"
                        : "border-zinc-800/80 bg-[#121215] opacity-60 hover:opacity-100"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                        <Award className="h-3.5 w-3.5 text-zinc-300" />
                        Critério Pontuável
                      </span>
                      {!field.fatalError && (
                        <Check className="h-3.5 w-3.5 text-zinc-100" />
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-snug">
                      Soma pontos na nota conforme o peso definido abaixo.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onUpdate({
                        fatalError: true,
                        weight: 0,
                        group: "Erro Grave",
                        category: "Erro Grave",
                      })
                    }
                    className={cn(
                      "p-3.5 rounded-lg border text-left transition-all space-y-1",
                      field.fatalError
                        ? "border-red-500/80 bg-red-950/25"
                        : "border-zinc-800/80 bg-[#121215] opacity-60 hover:opacity-100"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-red-300 flex items-center gap-1.5">
                        <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
                        Erro Grave (Fatal)
                      </span>
                      {field.fatalError && (
                        <Check className="h-3.5 w-3.5 text-red-400" />
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-snug">
                      Se marcado na avaliação, zera a nota final para 0%.
                    </p>
                  </button>
                </div>
              </div>

              {/* 5. Peso do Critério (Atalhos 1, 2, 3, 5, 10 + Controle fino) */}
              {!field.fatalError && (
                <div className="space-y-2.5 p-4 rounded-lg border border-zinc-800/90 bg-[#141418]">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-zinc-200">
                      Peso deste Critério (em pontos)
                    </label>
                    <span className="text-xs font-mono font-semibold text-zinc-100">
                      Vale {safeWeight} {safeWeight === 1 ? "ponto" : "pontos"}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    {/* Botões rápidos de peso */}
                    <div className="flex items-center gap-1.5">
                      {PRESET_WEIGHTS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => onUpdate({ weight: preset })}
                          className={cn(
                            "h-8 px-3 rounded-md text-xs font-mono font-medium border transition-colors",
                            safeWeight === preset
                              ? "bg-zinc-100 text-zinc-950 border-zinc-100 font-bold"
                              : "bg-[#0e0e11] text-zinc-400 border-zinc-800 hover:border-zinc-600 hover:text-zinc-200"
                          )}
                        >
                          {preset} pt{preset > 1 ? "s" : ""}
                        </button>
                      ))}
                    </div>

                    {/* Stepper manual */}
                    <div className="inline-flex items-center h-8 rounded-md border border-zinc-800 bg-[#0b0b0d]">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdate({ weight: Math.max(1, safeWeight - 1) })
                        }
                        className="h-full px-2.5 text-zinc-400 hover:text-zinc-100"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={safeWeight}
                        onChange={(e) =>
                          onUpdate({
                            weight: Math.max(
                              1,
                              Math.min(100, parseInt(e.target.value, 10) || 1)
                            ),
                          })
                        }
                        className="w-10 bg-transparent text-center font-mono text-xs font-bold text-zinc-100 focus:outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          onUpdate({ weight: Math.min(100, safeWeight + 1) })
                        }
                        className="h-full px-2.5 text-zinc-400 hover:text-zinc-100"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 6. Categoria / Etapa da Ligação */}
              {!field.fatalError && (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-zinc-300">
                    Etapa / Categoria da Ligação
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => onUpdate({ group: cat, category: cat })}
                        className={cn(
                          "px-2.5 py-1 rounded-md text-xs border transition-colors",
                          currentCategory.toLowerCase() === cat.toLowerCase()
                            ? "bg-zinc-100 text-zinc-950 border-zinc-100 font-medium"
                            : "bg-[#141418] text-zinc-400 border-zinc-800 hover:text-zinc-200"
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 7. Tamanho do Cartão na Tela */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-zinc-300">
                  Tamanho na Grade do Formulário
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => onUpdate({ width: "half" })}
                    className={cn(
                      "h-9 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-2 transition-colors",
                      field.width === "half"
                        ? "bg-zinc-100 text-zinc-950 border-zinc-100"
                        : "bg-[#141418] text-zinc-400 border-zinc-800 hover:text-zinc-200"
                    )}
                  >
                    <Columns2 className="h-3.5 w-3.5" />
                    <span>Meia Largura (2 por linha)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onUpdate({ width: "full" })}
                    className={cn(
                      "h-9 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-2 transition-colors",
                      field.width === "full"
                        ? "bg-zinc-100 text-zinc-950 border-zinc-100"
                        : "bg-[#141418] text-zinc-400 border-zinc-800 hover:text-zinc-200"
                    )}
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                    <span>Largura Inteira (100%)</span>
                  </button>
                </div>
              </div>

              {/* 8. Ações de Ordem, Duplicação e Exclusão */}
              <div className="pt-4 border-t border-zinc-800/80 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onMoveUp}
                    className="h-8 px-2.5 rounded-md border border-zinc-800 bg-[#141418] hover:bg-zinc-800 text-xs text-zinc-300 inline-flex items-center gap-1"
                  >
                    <ArrowUp className="h-3.5 w-3.5" /> Subir
                  </button>
                  <button
                    type="button"
                    onClick={onMoveDown}
                    className="h-8 px-2.5 rounded-md border border-zinc-800 bg-[#141418] hover:bg-zinc-800 text-xs text-zinc-300 inline-flex items-center gap-1"
                  >
                    <ArrowDown className="h-3.5 w-3.5" /> Descer
                  </button>
                  <button
                    type="button"
                    onClick={onDuplicate}
                    className="h-8 px-2.5 rounded-md border border-zinc-800 bg-[#141418] hover:bg-zinc-800 text-xs text-zinc-300 inline-flex items-center gap-1"
                  >
                    <Copy className="h-3.5 w-3.5" /> Duplicar
                  </button>
                </div>

                <button
                  type="button"
                  onClick={onDelete}
                  className="h-8 px-3 rounded-md border border-red-900/60 bg-red-950/20 hover:bg-red-950/50 text-xs text-red-400 inline-flex items-center gap-1.5"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Excluir
                </button>
              </div>
            </div>

            {/* Sticky Bottom Action Bar */}
            <div className="p-5 border-t border-zinc-800/80 bg-[#0b0b0d]">
              <button
                type="button"
                onClick={onClose}
                className="w-full h-10 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-950 font-semibold text-xs transition-colors"
              >
                Salvar e Concluir Edição
              </button>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
