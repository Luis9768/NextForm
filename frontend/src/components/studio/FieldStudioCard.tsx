"use client";

import React from "react";
import { Check, Minus, Plus, Settings2, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface FieldWeightStepperProps {
  weight: number;
  disabled?: boolean;
  onChange: (nextWeight: number) => void;
}

export function FieldWeightStepper({
  weight = 1,
  disabled,
  onChange,
}: FieldWeightStepperProps) {
  const safeWeight = Number.isFinite(weight) && weight > 0 ? weight : 1;
  return (
    <div
      className={cn(
        "inline-flex items-center h-7 rounded-md border border-zinc-800 bg-[#0a0a0c] overflow-hidden select-none shrink-0",
        disabled && "opacity-40 pointer-events-none"
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(1, safeWeight - 1))}
        className="h-full px-2 text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800/70 transition-colors flex items-center justify-center"
        title="Diminuir peso"
      >
        <Minus className="h-3 w-3" />
      </button>

      <div className="px-2.5 flex items-center gap-1 border-x border-zinc-800/80 h-full bg-[#0e0e11] whitespace-nowrap">
        <input
          type="number"
          min={1}
          max={100}
          value={safeWeight}
          onChange={(e) =>
            onChange(
              Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 1))
            )
          }
          className="w-6 bg-transparent text-center font-mono text-xs font-semibold text-zinc-100 focus:outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="text-[10px] font-mono text-zinc-500">
          {safeWeight === 1 ? "pt" : "pts"}
        </span>
      </div>

      <button
        type="button"
        onClick={() => onChange(Math.min(100, safeWeight + 1))}
        className="h-full px-2 text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800/70 transition-colors flex items-center justify-center"
        title="Aumentar peso"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}

interface FieldStudioCardProps {
  enabled?: boolean;
  onToggleEnabled?: () => void;
  fieldKey: string;
  group: string;
  label: string;
  description?: string;
  weight: number;
  fatalError: boolean;
  width: "half" | "full";
  onChangeWeight: (nextWeight: number) => void;
  onToggleWidth?: () => void;
  onOpenSettings: () => void;
}

function formatGroupLabel(group: string, fatalError: boolean): string {
  if (fatalError) return "Erro Grave";
  if (!group) return "Critério Geral";
  return group
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function FieldStudioCard({
  enabled = true,
  onToggleEnabled,
  group,
  label,
  description,
  weight,
  fatalError,
  width,
  onChangeWeight,
  onOpenSettings,
}: FieldStudioCardProps) {
  return (
    <div
      className={cn(
        width === "full" ? "col-span-12" : "col-span-12 xl:col-span-6",
        "group relative rounded-xl border transition-all duration-150 p-4 sm:p-5 flex flex-col justify-between gap-3.5",
        !enabled
          ? "border-zinc-800/50 bg-[#0b0b0d] opacity-50 hover:opacity-80"
          : fatalError
          ? "border-red-900/50 bg-[#110e10] hover:border-red-800/80"
          : "border-zinc-800/90 bg-[#111114] hover:border-zinc-700"
      )}
    >
      {/* Top Meta Bar: Active Checkbox + Category Badge + Weight Stepper + Edit */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 shrink-0">
          {onToggleEnabled && (
            <button
              type="button"
              onClick={onToggleEnabled}
              title={
                enabled
                  ? "Incluído nesta avaliação (clique para desativar)"
                  : "Oculto nesta avaliação (clique para incluir)"
              }
              className={cn(
                "h-5 w-5 rounded-[5px] flex items-center justify-center border transition-all shrink-0",
                enabled
                  ? "bg-zinc-100 border-zinc-100 text-zinc-950"
                  : "bg-transparent border-zinc-700 text-transparent hover:border-zinc-500"
              )}
            >
              <Check className="h-3.5 w-3.5 stroke-[2.5]" />
            </button>
          )}

          <span
            className={cn(
              "px-2.5 py-0.5 rounded-md text-[11px] font-medium border whitespace-nowrap shrink-0",
              fatalError
                ? "bg-red-950/50 text-red-300 border-red-900/60"
                : "bg-zinc-900/90 text-zinc-300 border-zinc-800"
            )}
          >
            {formatGroupLabel(group, fatalError)}
          </span>
        </div>

        {/* Right Controls: Weight Stepper or Fatal Badge + Edit Button */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {fatalError ? (
            <span className="inline-flex items-center gap-1 px-2.5 h-7 rounded-md text-[11px] font-medium bg-red-950/60 text-red-300 border border-red-900/60 whitespace-nowrap shrink-0">
              <ShieldAlert className="h-3 w-3 shrink-0" />
              <span>Zera a Nota (0%)</span>
            </span>
          ) : (
            <FieldWeightStepper weight={weight} onChange={onChangeWeight} />
          )}

          <button
            type="button"
            onClick={onOpenSettings}
            title="Personalizar pergunta e peso"
            className="h-7 px-2.5 rounded-md border border-zinc-800 bg-[#0a0a0c] hover:bg-zinc-800/80 text-zinc-400 hover:text-zinc-100 transition-colors inline-flex items-center gap-1.5 text-[11px] font-medium whitespace-nowrap shrink-0"
          >
            <Settings2 className="h-3 w-3 shrink-0" />
            <span>Editar</span>
          </button>
        </div>
      </div>

      {/* Main Content Body: Full Question Label + Description */}
      <div
        onClick={onOpenSettings}
        className="cursor-pointer space-y-1 pt-0.5"
      >
        <h3 className="text-sm sm:text-[15px] font-medium text-zinc-100 leading-snug tracking-tight group-hover:text-white">
          {label}
        </h3>
        {description && (
          <p className="text-xs text-zinc-500 leading-relaxed">{description}</p>
        )}
      </div>
    </div>
  );
}
