import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { EvaluationStatus, FormTemplate } from "@/types";

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

export function stripPlus55(raw: string): string {
  const trimmed = (raw || "").trim();
  if (trimmed.startsWith("+55")) {
    return trimmed.slice(3).trim();
  }
  return trimmed;
}

export function extractCleanPhoneDigits(raw: string): string {
  const trimmed = stripPlus55(raw);
  const digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return digits.slice(2);
  }
  return digits;
}

export function formatPhoneMask(value: string): string {
  const digits = extractCleanPhoneDigits(value).slice(0, 11);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

export interface LiveEvaluationScore {
  obtainedPoints: number;
  maxPossiblePoints: number;
  rawPercentage: number;
  finalPercentage: number;
  fatalTriggered: boolean;
  status: EvaluationStatus;
}

export function calculateLiveEvaluationScore(
  form: FormTemplate | null | undefined,
  checkedMap: Record<string, boolean>
): LiveEvaluationScore {
  if (!form) {
    return {
      obtainedPoints: 0,
      maxPossiblePoints: 0,
      rawPercentage: 0,
      finalPercentage: 0,
      fatalTriggered: false,
      status: "REPROVADO",
    };
  }

  const standardItems = form.items.filter((i) => !i.fatalError);
  const fatalItems = form.items.filter((i) => i.fatalError);

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
      status: "ZERADO_ERRO_GRAVE",
    };
  }

  const passing = Number(form.passingScorePercentage) || 80;
  return {
    obtainedPoints,
    maxPossiblePoints,
    rawPercentage,
    finalPercentage: rawPercentage,
    fatalTriggered: false,
    status: rawPercentage >= passing ? "APROVADO" : "REPROVADO",
  };
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
