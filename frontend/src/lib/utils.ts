import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { EvaluationStatus } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function formatDateTime(isoString?: string): string {
  if (!isoString) return "-";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

export function formatPhoneMask(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

export function getEvaluationStatusBadge(status?: EvaluationStatus | null) {
  switch (status) {
    case "APROVADO":
      return {
        label: "Aprovado",
        className:
          "bg-zinc-100 text-zinc-900 border-zinc-300 dark:bg-zinc-900 dark:text-zinc-200 dark:border-zinc-700 border font-medium",
      };
    case "REPROVADO":
      return {
        label: "Atenção / Reprovado",
        className:
          "bg-amber-50 text-amber-800 border-amber-200 dark:bg-zinc-900 dark:text-amber-300 dark:border-amber-800/70 border font-medium",
      };
    case "ZERADO_ERRO_GRAVE":
      return {
        label: "Zerado por Erro Grave",
        className:
          "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800/80 border font-semibold",
      };
    default:
      return {
        label: "Pendente",
        className:
          "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800 border",
      };
  }
}
