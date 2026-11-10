"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  Loader2,
  Lock,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  RotateCw,
  Search,
  Volume2,
  VolumeX,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { EditEvaluationScoreModal } from "@/components/evaluations/EditEvaluationScoreModal";
import { useAuth } from "@/context/AuthContext";
import {
  API_BASE_URL,
  callsApi,
  evaluationsApi,
  extractErrorMessage,
} from "@/lib/api";
import { formatDateTime } from "@/lib/utils";

interface TranscriptTurn {
  index: number;
  timestampLabel: string;
  startSeconds: number;
  endSeconds: number;
  speaker: "ATENDENTE" | "CLIENTE" | "OUTRO";
  speakerLabel: string;
  tone?: string;
  text: string;
}

function parseTranscriptTurns(rawText: string): TranscriptTurn[] {
  if (!rawText || !rawText.trim()) return [];
  const lines = rawText.split(/\r?\n/);
  const parsed: TranscriptTurn[] = [];
  const lineRegex =
    /^\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*(?:([^:]+?):\s*)?(.*)$/;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    const match = trimmed.match(lineRegex);
    if (match) {
      const p1 = parseInt(match[1], 10);
      const p2 = parseInt(match[2], 10);
      const p3 = match[3] ? parseInt(match[3], 10) : null;
      const startSeconds =
        p3 !== null ? p1 * 3600 + p2 * 60 + p3 : p1 * 60 + p2;
      const timestampLabel =
        p3 !== null
          ? `${String(p1).padStart(2, "0")}:${String(p2).padStart(
              2,
              "0"
            )}:${String(p3).padStart(2, "0")}`
          : `${String(p1).padStart(2, "0")}:${String(p2).padStart(2, "0")}`;

      const rawSpeaker = (match[4] || "").trim();
      const spokenText = (match[5] || "").trim();

      let speaker: "ATENDENTE" | "CLIENTE" | "OUTRO" = "OUTRO";
      let speakerLabel = rawSpeaker || "Diálogo";
      let tone: string | undefined;

      const toneMatch = rawSpeaker.match(/^([^(]+)\(([^)]+)\)$/);
      if (toneMatch) {
        speakerLabel = toneMatch[1].trim();
        tone = toneMatch[2].trim();
      }

      const lowerSpk = speakerLabel.toLowerCase();
      if (
        lowerSpk.includes("atendente") ||
        lowerSpk.includes("operador") ||
        lowerSpk.includes("agente") ||
        lowerSpk.includes("consultor")
      ) {
        speaker = "ATENDENTE";
        speakerLabel = "Agente";
      } else if (
        lowerSpk.includes("cliente") ||
        lowerSpk.includes("usuário") ||
        lowerSpk.includes("usuario")
      ) {
        speaker = "CLIENTE";
        speakerLabel = "Cliente";
      } else if (lowerSpk.includes("indefinido")) {
        const lowerTxt = spokenText.toLowerCase();
        if (
          lowerTxt.includes("central de relacionamento") ||
          lowerTxt.includes("confirmação de dados") ||
          lowerTxt.includes("protocolo de atendimento") ||
          lowerTxt.includes("posso ajudar") ||
          lowerTxt.includes("com quem eu falo")
        ) {
          speaker = "ATENDENTE";
          speakerLabel = "Agente";
        } else {
          speaker = parsed.length % 2 === 0 ? "ATENDENTE" : "CLIENTE";
          speakerLabel = speaker === "ATENDENTE" ? "Agente" : "Cliente";
        }
      }

      parsed.push({
        index: parsed.length,
        timestampLabel,
        startSeconds,
        endSeconds: startSeconds + 8,
        speaker,
        speakerLabel,
        tone,
        text: spokenText || trimmed,
      });
    } else if (parsed.length > 0) {
      parsed[parsed.length - 1].text += ` ${trimmed}`;
    } else {
      parsed.push({
        index: 0,
        timestampLabel: "00:00",
        startSeconds: 0,
        endSeconds: 10,
        speaker: "OUTRO",
        speakerLabel: "Transcrição",
        text: trimmed,
      });
    }
  }

  for (let i = 0; i < parsed.length - 1; i++) {
    const nextStart = parsed[i + 1].startSeconds;
    if (nextStart > parsed[i].startSeconds) {
      parsed[i].endSeconds = nextStart;
    }
  }
  return parsed;
}

interface WaveformMarker {
  seconds: number;
  label: string;
  description: string;
  isFatal: boolean;
}

function extractWaveformMarkers(
  generalFeedback: string,
  fatalTriggered: boolean
): WaveformMarker[] {
  const markers: WaveformMarker[] = [];
  const seenSecs = new Set<number>();

  if (!generalFeedback) return markers;
  const regex = /\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]([^;\n•\[]*)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(generalFeedback)) !== null) {
    const p1 = parseInt(m[1], 10);
    const p2 = parseInt(m[2], 10);
    const p3 = m[3] ? parseInt(m[3], 10) : null;
    const secs = p3 !== null ? p1 * 3600 + p2 * 60 + p3 : p1 * 60 + p2;
    if (secs >= 0 && !seenSecs.has(secs)) {
      seenSecs.add(secs);
      const rawDesc = (m[4] || "")
        .replace(/^[\s—\-:]+/, "")
        .trim()
        .slice(0, 90);
      markers.push({
        seconds: secs,
        label: `${String(p1).padStart(2, "0")}:${String(p2).padStart(2, "0")}`,
        description: rawDesc || "Observação QA",
        isFatal:
          fatalTriggered &&
          (rawDesc.toLowerCase().includes("grave") ||
            rawDesc.toLowerCase().includes("tabulação") ||
            rawDesc.toLowerCase().includes("inverídic")),
      });
    }
  }
  return markers.sort((a, b) => a.seconds - b.seconds);
}

export default function EvaluationDetailPage() {
  const params = useParams<{ id: string }>();
  const evalId = params.id;
  const router = useRouter();
  const { isGestor } = useAuth();

  const [isEditingModalOpen, setIsEditingModalOpen] = useState(false);
  const [rightTab, setRightTab] = useState<
    "criteria" | "observations" | "customer"
  >("criteria");
  const [criteriaFilter, setCriteriaFilter] = useState<"ALL" | "UNCHECKED">(
    "ALL"
  );
  const [transcriptSearch, setTranscriptSearch] = useState("");
  const [copiedVarKey, setCopiedVarKey] = useState<string | null>(null);

  // Player de Áudio Sincronizado do Espelho
  const studioAudioRef = useRef<HTMLAudioElement | null>(null);
  const transcriptContainerRef = useRef<HTMLDivElement | null>(null);
  const [activeRecordingIdx, setActiveRecordingIdx] = useState(0);
  const [studioPlaying, setStudioPlaying] = useState(false);
  const [studioCurrentTime, setStudioCurrentTime] = useState(0);
  const [studioDuration, setStudioDuration] = useState(180);
  const [studioSpeed, setStudioSpeed] = useState(1);
  const [studioMuted, setStudioMuted] = useState(false);
  const [studioVolume, setStudioVolume] = useState(0.95);

  const {
    data: evaluation,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["evaluation-detail", evalId],
    queryFn: () => evaluationsApi.getById(evalId),
    enabled: !!evalId,
  });

  const recordingsList = useMemo(() => {
    const metaRecs = evaluation?.callRecord?.metadata?.recordings;
    if (Array.isArray(metaRecs) && metaRecs.length > 0) {
      return metaRecs as Array<{
        audioUrl: string;
        label?: string;
        fileName?: string;
        durationSeconds?: number;
      }>;
    }
    if (evaluation?.callRecord?.audioUrl) {
      return [
        {
          audioUrl: evaluation.callRecord.audioUrl,
          label: "Ligação #1",
          fileName: evaluation.callRecord.externalCallId,
          durationSeconds: evaluation.callRecord.durationSeconds || 180,
        },
      ];
    }
    return [];
  }, [evaluation]);

  const activeRecording =
    recordingsList[activeRecordingIdx] || recordingsList[0] || null;

  const resolvedAudioSrc = useMemo(() => {
    const raw =
      activeRecording?.audioUrl || evaluation?.callRecord?.audioUrl || "";
    if (!raw) return "";
    if (raw.startsWith("http://localhost:8080/api/v1")) {
      return `${API_BASE_URL}${raw.substring(
        "http://localhost:8080/api/v1".length
      )}`;
    }
    if (raw.startsWith("/api/v1")) {
      return `${API_BASE_URL}${raw.substring("/api/v1".length)}`;
    }
    return raw;
  }, [activeRecording?.audioUrl, evaluation?.callRecord?.audioUrl]);

  useEffect(() => {
    setStudioPlaying(false);
    setStudioCurrentTime(0);
    setStudioDuration(
      activeRecording?.durationSeconds ||
        evaluation?.callRecord?.durationSeconds ||
        180
    );
  }, [
    activeRecordingIdx,
    resolvedAudioSrc,
    activeRecording?.durationSeconds,
    evaluation?.callRecord?.durationSeconds,
  ]);

  const toggleStudioPlay = useCallback(async () => {
    const audio = studioAudioRef.current;
    if (!audio) return;
    try {
      if (studioPlaying) {
        audio.pause();
        setStudioPlaying(false);
      } else {
        await audio.play();
        setStudioPlaying(true);
      }
    } catch {
      setStudioPlaying(false);
    }
  }, [studioPlaying]);

  const seekStudioAudioTo = useCallback(
    async (seconds: number, autoPlay = true) => {
      const audio = studioAudioRef.current;
      const clamped = Math.max(
        0,
        Math.min(seconds, Math.max(studioDuration, 1))
      );
      setStudioCurrentTime(clamped);
      if (audio) {
        audio.currentTime = clamped;
        if (autoPlay && !studioPlaying) {
          try {
            await audio.play();
            setStudioPlaying(true);
          } catch {
            // Ignora bloqueio de autoplay
          }
        }
      }
    },
    [studioDuration, studioPlaying]
  );

  const skipStudioSeconds = useCallback(
    (delta: number) => {
      const audio = studioAudioRef.current;
      const base = audio ? audio.currentTime : studioCurrentTime;
      seekStudioAudioTo(base + delta, false);
    },
    [studioCurrentTime, seekStudioAudioTo]
  );

  // Atalhos de Teclado (Espaço = Play/Pause, Setas = ±5s)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditingModalOpen) return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        (e.target as HTMLElement | null)?.isContentEditable
      ) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        toggleStudioPlay();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        skipStudioSeconds(-5);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        skipStudioSeconds(5);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEditingModalOpen, toggleStudioPlay, skipStudioSeconds]);

  const rawTranscricao = useMemo(() => {
    const meta = evaluation?.callRecord?.metadata;
    if (typeof meta?.transcricao === "string" && meta.transcricao.trim()) {
      return meta.transcricao
        .replace(/^```\n?/, "")
        .replace(/\n?```$/, "")
        .trim();
    }
    return "";
  }, [evaluation?.callRecord?.metadata]);

  const parsedTranscriptTurns = useMemo(
    () => parseTranscriptTurns(rawTranscricao),
    [rawTranscricao]
  );

  const filteredTranscriptTurns = useMemo(() => {
    const q = transcriptSearch.trim().toLowerCase();
    if (!q) return parsedTranscriptTurns;
    return parsedTranscriptTurns.filter(
      (t) =>
        t.text.toLowerCase().includes(q) ||
        t.timestampLabel.toLowerCase().includes(q) ||
        t.speakerLabel.toLowerCase().includes(q)
    );
  }, [parsedTranscriptTurns, transcriptSearch]);

  const activeTurnIndex = useMemo(() => {
    if (studioCurrentTime <= 0 || parsedTranscriptTurns.length === 0) return -1;
    for (let i = parsedTranscriptTurns.length - 1; i >= 0; i--) {
      if (studioCurrentTime >= parsedTranscriptTurns[i].startSeconds) {
        return parsedTranscriptTurns[i].index;
      }
    }
    return -1;
  }, [parsedTranscriptTurns, studioCurrentTime]);

  // Karaoke Auto-scroll sincronizado com o áudio
  useEffect(() => {
    if (
      activeTurnIndex < 0 ||
      !transcriptContainerRef.current ||
      transcriptSearch.trim()
    ) {
      return;
    }
    const container = transcriptContainerRef.current;
    const activeEl = container.querySelector<HTMLElement>(
      `[data-turn-index="${activeTurnIndex}"]`
    );
    if (!activeEl) return;
    const targetTop =
      activeEl.offsetTop -
      container.clientHeight * 0.35 +
      activeEl.clientHeight * 0.5;
    container.scrollTo({
      top: Math.max(0, targetTop),
      behavior: "smooth",
    });
  }, [activeTurnIndex, transcriptSearch]);

  const formatMmSs = (secs: number) => {
    const safe = Math.max(0, Math.floor(secs || 0));
    const mm = String(Math.floor(safe / 60)).padStart(2, "0");
    const ss = String(safe % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  const standardItems = useMemo(
    () => (evaluation ? evaluation.items.filter((i) => !i.fatalError) : []),
    [evaluation]
  );

  const fatalItems = useMemo(
    () => (evaluation ? evaluation.items.filter((i) => i.fatalError) : []),
    [evaluation]
  );

  const checkedStandardCount = useMemo(
    () => standardItems.filter((i) => i.checked).length,
    [standardItems]
  );

  const uncheckedStandardCount = useMemo(
    () => standardItems.filter((i) => !i.checked).length,
    [standardItems]
  );

  const waveformMarkers = useMemo(
    () =>
      extractWaveformMarkers(
        evaluation?.generalFeedback || "",
        Boolean(evaluation?.fatalErrorTriggered)
      ),
    [evaluation?.generalFeedback, evaluation?.fatalErrorTriggered]
  );

  const waveformBars = useMemo(() => {
    const seedStr = evaluation?.id || "espelho";
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
      hash = (hash * 31 + seedStr.charCodeAt(i)) | 0;
    }
    return Array.from({ length: 120 }, (_, idx) => {
      const v = Math.abs(Math.sin(idx * 0.43 + hash) * Math.cos(idx * 0.19));
      return Math.max(18, Math.min(96, Math.round(20 + v * 75)));
    });
  }, [evaluation?.id]);

  const customerRows = useMemo(() => {
    if (!evaluation) return [];
    const cust = evaluation.callRecord?.customer;
    const meta = (evaluation.callRecord?.metadata || {}) as Record<
      string,
      unknown
    >;
    const aiData =
      meta.aiEvaluationData && typeof meta.aiEvaluationData === "object"
        ? (meta.aiEvaluationData as Record<string, unknown>)
        : {};

    const pickMeta = (...keys: string[]) => {
      for (const k of keys) {
        const v = meta[k] ?? aiData[k];
        if (v !== undefined && v !== null && String(v).trim() !== "") {
          return String(v).trim();
        }
      }
      return "";
    };

    const sectorLower = (
      evaluation.analystSectorSnapshot ||
      evaluation.analyst?.department ||
      ""
    ).toLowerCase();
    const isSacRet =
      sectorLower.includes("sac") ||
      sectorLower.includes("reten") ||
      sectorLower.includes("cobran");

    if (isSacRet) {
      return [
        {
          key: "ticket_id",
          val:
            pickMeta("ticket_id", "ticket", "Ticket").replace(/#/g, "") ||
            cust?.proposal?.replace(/#/g, "") ||
            "-",
        },
        {
          key: "protocolo",
          val: pickMeta("protocolo", "Protocolo") || cust?.protocol || "-",
        },
        {
          key: "nome_completo",
          val: pickMeta("nome_completo", "Nome") || cust?.name || "-",
        },
        {
          key: "cpf",
          val: pickMeta("cpf", "CPF") || cust?.document || "-",
        },
        {
          key: "telefone_origem",
          val:
            pickMeta("telefone_origem", "telefone") ||
            cust?.phone ||
            evaluation.callRecord.customerIdentifier ||
            "-",
        },
        {
          key: "administradora",
          val: pickMeta("administradora") || "-",
        },
        {
          key: "operadora",
          val: pickMeta("operadora") || cust?.contractedPlan || "-",
        },
        {
          key: "situacao",
          val: pickMeta("situacao") || "-",
        },
        {
          key: "canal_de_entrada",
          val: pickMeta("canal_de_entrada") || "-",
        },
        {
          key: "motivo_contato",
          val: pickMeta("motivo_contato") || "-",
        },
        {
          key: "submotivo_plano",
          val: pickMeta("submotivo_plano") || "-",
        },
        {
          key: "nome_atendente",
          val: pickMeta("nome_atendente") || evaluation.analyst.name || "-",
        },
        {
          key: "data_avaliacao",
          val: formatDateTime(evaluation.evaluatedAt),
        },
      ];
    }

    return [
      {
        key: "telefone_portabilidade",
        val: cust?.phone || evaluation.callRecord.customerIdentifier || "-",
      },
      { key: "nome", val: cust?.name || "-" },
      { key: "cpf", val: cust?.document || "-" },
      { key: "proposta", val: cust?.proposal || "-" },
      { key: "data_da_venda", val: cust?.saleDate || "-" },
      { key: "data_de_nascimento", val: cust?.birthDate || "-" },
      { key: "nome_da_mae", val: cust?.motherName || "-" },
      { key: "plano_contratado", val: cust?.contractedPlan || "-" },
      { key: "email", val: cust?.email || "-" },
      { key: "forma_de_pagamento", val: cust?.paymentMethod || "-" },
      { key: "tipo_de_fatura", val: cust?.invoiceType || "-" },
      { key: "vencimento", val: cust?.dueDate || "-" },
      {
        key: "portabilidade_antecipada",
        val: cust?.earlyPortability || "-",
      },
      { key: "endereco_completo", val: cust?.fullAddress || "-" },
    ];
  }, [evaluation]);

  if (isLoading) {
    return (
      <AppShell>
        <div className="h-full flex items-center justify-center bg-[#0b0b0d] text-xs font-mono text-zinc-400 gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-zinc-200" />
          <span>Carregando espelho da avaliação…</span>
        </div>
      </AppShell>
    );
  }

  if (error || !evaluation) {
    return (
      <AppShell>
        <div className="p-6 m-6 bg-red-950/40 border border-red-900 rounded-xl text-red-200 text-xs">
          {extractErrorMessage(error)}
        </div>
      </AppShell>
    );
  }

  const sectorLabel =
    evaluation.analystSectorSnapshot ||
    evaluation.analyst.department ||
    "Geral";
  const finalPct = Number(evaluation.finalScorePercentage || 0);
  const passingPct = Number(evaluation.passingScoreSnapshot || 80);

  return (
    <AppShell>
      <div className="h-full flex flex-col overflow-hidden bg-[#0b0b0d] text-zinc-100">
        {/* Elemento de Áudio HTML5 Sincronizado */}
        <audio
          ref={studioAudioRef}
          src={resolvedAudioSrc}
          preload="metadata"
          onLoadedMetadata={(e) => {
            const el = e.currentTarget;
            if (el.duration && isFinite(el.duration) && el.duration > 0) {
              const realSecs = Math.round(el.duration);
              setStudioDuration(realSecs);
              if (
                evaluation.callRecord.externalCallId &&
                Math.abs(
                  realSecs - (evaluation.callRecord.durationSeconds || 0)
                ) > 2
              ) {
                callsApi
                  .syncDetectedDuration(
                    evaluation.callRecord.externalCallId,
                    realSecs
                  )
                  .catch(() => {});
              }
            }
          }}
          onTimeUpdate={(e) => {
            setStudioCurrentTime(e.currentTarget.currentTime);
          }}
          onPlay={() => setStudioPlaying(true)}
          onPause={() => setStudioPlaying(false)}
          onEnded={() => setStudioPlaying(false)}
        />

        {/* Barra Superior Minimalista de 1 Linha (Idêntica à Workstation de Avaliação) */}
        <header className="h-12 px-5 border-b border-zinc-800/70 bg-[#0b0b0d] flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Voltar"
              title="Voltar"
              className="h-7 w-7 rounded-md border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 flex items-center justify-center transition-colors shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            <h1 className="text-sm font-semibold text-zinc-100 truncate">
              {evaluation.analyst.name}
            </h1>

            <span className="px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800/80 text-[10px] font-mono uppercase tracking-wider text-zinc-400 shrink-0">
              {sectorLabel}
            </span>

            <span className="text-zinc-700 hidden sm:inline" aria-hidden="true">
              /
            </span>

            <span className="hidden sm:inline-flex items-center h-7 px-2.5 rounded-md border border-zinc-800/80 bg-zinc-900/40 text-xs text-zinc-300 truncate max-w-[240px]">
              {evaluation.formNameSnapshot}
            </span>

            <span className="hidden md:inline-flex items-center h-6 px-2 rounded bg-zinc-900/80 border border-zinc-800 text-[11px] font-mono text-zinc-400 shrink-0">
              #{evaluation.callRecord.externalCallId}
            </span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {isGestor && (
              <button
                type="button"
                onClick={() => setIsEditingModalOpen(true)}
                className="h-7 px-3 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs font-medium text-zinc-100 inline-flex items-center gap-1.5 transition-colors"
              >
                <Pencil className="h-3 w-3" />
                <span>Editar Nota</span>
              </button>
            )}

            <div className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-zinc-800 bg-zinc-900/60 text-[11px] font-mono text-zinc-400">
              <Lock className="h-3 w-3 text-zinc-500" />
              <span>Espelho</span>
            </div>
          </div>
        </header>

        {/* CORPO SPLIT-PANE (ESQUERDA: CONVERSA SINCRONIZADA | DIREITA: ABAS DO ESPELHO) */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* ================================================================
              COLUNA ESQUERDA (6 COLUNAS): CONVERSA SINCRONIZADA (SOMENTE LEITURA)
             ================================================================ */}
          <div className="lg:col-span-6 h-full min-h-0 flex flex-col border-b lg:border-b-0 lg:border-r border-zinc-800/70 bg-[#0b0b0d]">
            <div className="h-10 px-5 border-b border-zinc-800/70 flex items-center justify-between gap-3 shrink-0">
              <div className="relative flex-1 max-w-xs">
                <Search
                  className="h-3 w-3 text-zinc-500 absolute left-2.5 top-2"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  name="transcriptSearch"
                  autoComplete="off"
                  aria-label="Filtrar conversa"
                  value={transcriptSearch}
                  onChange={(e) => setTranscriptSearch(e.target.value)}
                  placeholder="Buscar na conversa…"
                  className="w-full h-7 pl-7 pr-2.5 rounded-md border border-zinc-800/80 bg-zinc-900/50 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600 transition-colors"
                />
              </div>

              <span className="text-[11px] font-mono text-zinc-500">
                 Avaliado em {formatDateTime(evaluation.evaluatedAt)}
              </span>
            </div>

            <div
              ref={transcriptContainerRef}
              className="flex-1 min-h-0 overflow-y-auto px-6 py-5 relative"
            >
              {filteredTranscriptTurns.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-16 px-4 space-y-2">
                  <p className="text-xs text-zinc-400">
                    {transcriptSearch
                      ? "Nenhum trecho encontrado para esta busca."
                      : "Transcrição não disponível para esta gravação."}
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  {filteredTranscriptTurns.map((turn) => {
                    const isCurrentTurn =
                      studioCurrentTime >= turn.startSeconds &&
                      studioCurrentTime < turn.endSeconds;
                    const isAgent = turn.speaker === "ATENDENTE";

                    return (
                      <div
                        key={turn.index}
                        data-turn-index={turn.index}
                        className="group flex items-start gap-3"
                      >
                        <span
                          className={`mt-0.5 h-6 w-6 rounded-full text-[10px] font-mono font-semibold flex items-center justify-center shrink-0 ${
                            isCurrentTurn
                              ? "bg-zinc-100 text-zinc-950 ring-2 ring-zinc-400/40"
                              : isAgent
                              ? "bg-zinc-800 text-zinc-200"
                              : "bg-zinc-900 text-zinc-400 border border-zinc-800"
                          }`}
                        >
                          {isAgent ? "A" : "U"}
                        </span>

                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-zinc-200">
                              {turn.speakerLabel}
                            </span>
                            {turn.tone && (
                              <span className="text-[11px] text-zinc-500 truncate">
                                · {turn.tone.toLowerCase()}
                              </span>
                            )}
                          </div>

                          <div
                            onClick={() =>
                              seekStudioAudioTo(turn.startSeconds, true)
                            }
                            className={`rounded-lg px-3.5 py-2.5 text-[13px] leading-relaxed cursor-pointer transition-colors ${
                              isCurrentTurn
                                ? "bg-zinc-800/90 text-zinc-50 border border-zinc-700"
                                : isAgent
                                ? "bg-zinc-900/60 hover:bg-zinc-900 text-zinc-200 border border-zinc-800/60"
                                : "text-zinc-300 hover:bg-zinc-900/35 px-1 py-1"
                            }`}
                          >
                            {turn.text}
                          </div>

                          <div className="flex items-center gap-2 pt-0.5">
                            <button
                              type="button"
                              onClick={() =>
                                seekStudioAudioTo(turn.startSeconds, true)
                              }
                              className="text-[11px] font-mono tabular-nums text-zinc-500 hover:text-zinc-200 transition-colors"
                            >
                              {turn.timestampLabel}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ================================================================
              COLUNA DIREITA (6 COLUNAS): ABAS FLAT EM MODO ESPELHO (SOMENTE LEITURA)
             ================================================================ */}
          <div className="lg:col-span-6 h-full min-h-0 flex flex-col bg-[#0b0b0d]">
            <div className="h-10 px-6 border-b border-zinc-800/70 flex items-center justify-between gap-4 shrink-0">
              <div
                role="tablist"
                aria-label="Seções do espelho da avaliação"
                className="flex items-center gap-6 h-full"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={rightTab === "criteria"}
                  onClick={() => setRightTab("criteria")}
                  className={`h-full text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                    rightTab === "criteria"
                      ? "border-zinc-100 text-zinc-100"
                      : "border-transparent text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <span>Critérios</span>
                  <span className="text-[11px] font-mono text-zinc-500 tabular-nums">
                    {checkedStandardCount}/{standardItems.length}
                  </span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={rightTab === "observations"}
                  onClick={() => setRightTab("observations")}
                  className={`h-full text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                    rightTab === "observations"
                      ? "border-zinc-100 text-zinc-100"
                      : "border-transparent text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <span>Observações & Falta Grave</span>
                  {evaluation.fatalErrorTriggered && (
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-red-500"
                      aria-label="Falta grave ativa"
                    />
                  )}
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={rightTab === "customer"}
                  onClick={() => setRightTab("customer")}
                  className={`h-full text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                    rightTab === "customer"
                      ? "border-zinc-100 text-zinc-100"
                      : "border-transparent text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <span>Dados do Cliente</span>
                </button>
              </div>

              <span className="text-[11px] font-mono text-zinc-500 hidden sm:inline tabular-nums">
                Meta: {passingPct.toFixed(0)}%
              </span>
            </div>

            {/* Conteúdo Rolável da Aba Selecionada (Somente Leitura) */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {/* ABA 1: CRITÉRIOS (SOMENTE LEITURA) */}
              {rightTab === "criteria" && (
                <div>
                  <div className="px-6 py-2.5 border-b border-zinc-800/60 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setCriteriaFilter("ALL")}
                        className={`font-medium transition-colors ${
                          criteriaFilter === "ALL"
                            ? "text-zinc-100"
                            : "text-zinc-500 hover:text-zinc-300"
                        }`}
                      >
                        Todos ({standardItems.length})
                      </button>
                      <span className="text-zinc-700">·</span>
                      <button
                        type="button"
                        onClick={() => setCriteriaFilter("UNCHECKED")}
                        className={`font-medium transition-colors ${
                          criteriaFilter === "UNCHECKED"
                            ? "text-amber-300"
                            : "text-zinc-500 hover:text-zinc-300"
                        }`}
                      >
                        Desmarcados ({uncheckedStandardCount})
                      </button>
                    </div>

                    <span className="text-[11px] font-mono text-zinc-500">
                      Avaliador: {evaluation.evaluator.name}
                    </span>
                  </div>

                  {/* Linha de Falta Grave (Somente Leitura) */}
                  {(fatalItems.length > 0 ||
                    evaluation.fatalErrorTriggered) && (
                    <div className="border-b border-zinc-800/70">
                      {(fatalItems.length > 0
                        ? fatalItems
                        : [
                            {
                              id: "fatal-fallback",
                              label: "Falta_Grave • Falta Grave Eliminatória",
                              checked: evaluation.fatalErrorTriggered,
                              observation: null,
                            },
                          ]
                      ).map((item) => {
                        const isTriggered =
                          Boolean(item.checked) ||
                          Boolean(evaluation.fatalErrorTriggered);
                        return (
                          <div
                            key={item.id}
                            className={`px-6 py-3 flex items-center justify-between gap-4 ${
                              isTriggered ? "bg-red-950/20" : ""
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <input
                                type="checkbox"
                                checked={isTriggered}
                                readOnly
                                disabled
                                className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-red-500 shrink-0 opacity-90 cursor-default"
                              />
                              <span
                                className={`text-xs font-medium truncate ${
                                  isTriggered ? "text-red-200" : "text-zinc-400"
                                }`}
                              >
                                {item.label}
                              </span>
                            </div>

                            <span
                              className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded shrink-0 ${
                                isTriggered
                                  ? "bg-red-950/60 text-red-300 border border-red-900/60"
                                  : "text-zinc-500"
                              }`}
                            >
                              {isTriggered
                                ? "FALTA GRAVE ATIVA"
                                : "Eliminatório"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Lista Flat de Critérios Regulares (Somente Leitura) */}
                  <div className="divide-y divide-zinc-800/50">
                    {standardItems
                      .filter((it) =>
                        criteriaFilter === "UNCHECKED" ? !it.checked : true
                      )
                      .map((item) => {
                        const checked = Boolean(item.checked);
                        const pts = item.points || 1;
                        return (
                          <div key={item.id} className="px-6 py-3">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-start gap-3 min-w-0 flex-1">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  readOnly
                                  disabled
                                  className="mt-0.5 h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-zinc-100 shrink-0 opacity-90 cursor-default"
                                />
                                <div className="min-w-0 space-y-0.5">
                                  <span
                                    className={`text-[13px] leading-snug block ${
                                      checked
                                        ? "text-zinc-200"
                                        : "text-amber-200/90 font-medium"
                                    }`}
                                  >
                                    {item.label}
                                  </span>
                                  <span className="text-[11px] text-zinc-500 block">
                                    {item.category}
                                  </span>
                                  {item.observation && (
                                    <p className="text-[11px] font-mono text-zinc-400 pt-1">
                                      Obs: {item.observation}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <span
                                className={`text-xs font-mono tabular-nums shrink-0 ${
                                  checked ? "text-zinc-400" : "text-red-400"
                                }`}
                              >
                                {checked ? `${pts} pts` : `0/${pts}`}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* ABA 2: OBSERVAÇÕES & FALTA GRAVE (SOMENTE LEITURA) */}
              {rightTab === "observations" && (
                <div className="p-6 space-y-6">
                  {evaluation.fatalErrorTriggered && (
                    <div className="p-4 rounded-xl border border-red-900/70 bg-red-950/25 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-red-200 flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                          <span>Avaliação Zerada por Falta Grave</span>
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-red-950/70 text-red-300 border border-red-800/70">
                          Nota 0%
                        </span>
                      </div>
                      <p className="text-xs text-red-200/90 leading-relaxed">
                        Pontuação nos critérios regulares:{" "}
                        <strong>
                          {evaluation.obtainedPoints}/
                          {evaluation.maxPossiblePoints} pts (
                          {Number(evaluation.rawScorePercentage).toFixed(0)}%)
                        </strong>
                        .
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <span className="text-xs font-medium text-zinc-300 block">
                      Feedback e Observações da Monitoria (
                      {evaluation.evaluator.name})
                    </span>
                    <div className="p-4 rounded-lg border border-zinc-800/80 bg-zinc-900/35 text-xs font-mono leading-relaxed text-zinc-200 whitespace-pre-wrap">
                      {evaluation.generalFeedback ||
                        "Nenhuma observação registrada nesta avaliação."}
                    </div>
                  </div>

                  {waveformMarkers.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-medium text-zinc-300 block">
                        Minutagens Apontadas (Clique para ouvir o trecho)
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {waveformMarkers.map((mk) => (
                          <button
                            key={`${mk.label}_${mk.seconds}`}
                            type="button"
                            onClick={() => seekStudioAudioTo(mk.seconds, true)}
                            className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono inline-flex items-center gap-2 transition-colors ${
                              mk.isFatal
                                ? "border-red-900/70 bg-red-950/30 hover:bg-red-950/50 text-red-200"
                                : "border-amber-900/60 bg-amber-950/25 hover:bg-amber-950/40 text-amber-200"
                            }`}
                          >
                            <span className="font-bold">[{mk.label}]</span>
                            <span className="truncate max-w-[260px] text-zinc-300">
                              {mk.description}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ABA 3: DADOS DO CLIENTE (VARIÁVEIS DINÂMICAS ESTILO ELEVENLABS) */}
              {rightTab === "customer" && (
                <div className="p-6 space-y-4">
                  <h3 className="text-xs font-medium text-zinc-300">
                    Variáveis dinâmicas
                  </h3>

                  <div className="divide-y divide-zinc-800/60 border-t border-b border-zinc-800/60">
                    {customerRows.map((row) => (
                      <div
                        key={row.key}
                        className="py-2.5 flex items-start justify-between gap-4 text-xs"
                      >
                        <span
                          className="font-mono text-zinc-400 shrink-0"
                          translate="no"
                        >
                          <span className="text-zinc-600 mr-1.5">{"{}"}</span>
                          {row.key}
                        </span>
                        <div className="flex items-center gap-2 min-w-0 text-right">
                          <span className="font-mono text-zinc-200 break-words">
                            {row.val}
                          </span>
                          <button
                            type="button"
                            aria-label={`Copiar ${row.key}`}
                            onClick={() => {
                              navigator.clipboard
                                ?.writeText(row.val)
                                .catch(() => {});
                              setCopiedVarKey(row.key);
                              setTimeout(() => setCopiedVarKey(null), 1500);
                            }}
                            className="text-zinc-500 hover:text-zinc-200 shrink-0"
                          >
                            {copiedVarKey === row.key ? (
                              <Check
                                className="h-3 w-3 text-emerald-400"
                                aria-hidden="true"
                              />
                            ) : (
                              <Copy className="h-3 w-3" aria-hidden="true" />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Rodapé Enxuto do Painel Direito: Nota Final + Voltar (+ Editar Nota para Gestor/Admin) */}
            <div className="h-12 px-6 border-t border-zinc-800/70 bg-[#0b0b0d] flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
                <span className="text-zinc-500">Nota:</span>
                <span
                  className={`font-semibold ${
                    evaluation.fatalErrorTriggered
                      ? "text-red-400"
                      : evaluation.status === "APROVADO"
                      ? "text-emerald-400"
                      : "text-amber-300"
                  }`}
                >
                  {finalPct.toFixed(0)}% ({evaluation.obtainedPoints}/
                  {evaluation.maxPossiblePoints} pts)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="h-8 px-3 rounded-md border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-xs text-zinc-300 transition-colors"
                >
                  Voltar
                </button>
                {isGestor && (
                  <button
                    type="button"
                    onClick={() => setIsEditingModalOpen(true)}
                    className="h-8 px-3.5 rounded-md bg-zinc-100 text-zinc-950 hover:bg-zinc-200 font-semibold text-xs inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Editar Nota</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ================================================================
            DOCK INFERIOR DE ÁUDIO & WAVEFORM (IDÊNTICO À WORKSTATION)
           ================================================================ */}
        <div className="border-t border-zinc-800/70 bg-[#0b0b0d] px-6 py-2.5 space-y-2 shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 min-w-0">
              {recordingsList.length > 1 ? (
                <select
                  aria-label="Selecionar gravação"
                  value={activeRecordingIdx}
                  onChange={(e) =>
                    setActiveRecordingIdx(Number(e.target.value))
                  }
                  className="h-7 px-2 rounded-md border border-zinc-800 bg-zinc-900 text-xs font-mono text-zinc-200 focus:outline-none"
                >
                  {recordingsList.map((rec, idx) => (
                    <option key={idx} value={idx}>
                      Ligação #{idx + 1} —{" "}
                      {rec.fileName || evaluation.callRecord.externalCallId}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs font-mono text-zinc-500 truncate max-w-[240px]">
                  {activeRecording?.fileName ||
                    `#${evaluation.callRecord.externalCallId}`}
                </span>
              )}
            </div>

            {/* Centro: 1x | -5s | Play/Pause | +5s | 00:00 / 15:04 */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  const rates = [1, 1.25, 1.5, 2];
                  const next =
                    rates[(rates.indexOf(studioSpeed) + 1) % rates.length];
                  setStudioSpeed(next);
                  if (studioAudioRef.current) {
                    studioAudioRef.current.playbackRate = next;
                  }
                }}
                aria-label="Alterar velocidade de reprodução"
                className="text-xs font-mono tabular-nums text-zinc-400 hover:text-zinc-100 px-1.5 py-0.5 rounded transition-colors"
              >
                {studioSpeed}x
              </button>

              <button
                type="button"
                aria-label="Retroceder 5 segundos"
                onClick={() => skipStudioSeconds(-5)}
                className="h-7 w-7 rounded-md text-zinc-400 hover:text-zinc-100 flex items-center justify-center transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              </button>

              <button
                type="button"
                aria-label={studioPlaying ? "Pausar áudio" : "Reproduzir áudio"}
                onClick={toggleStudioPlay}
                className="h-8 w-8 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-zinc-200 flex items-center justify-center transition-colors shadow-sm"
              >
                {studioPlaying ? (
                  <Pause className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Play className="h-4 w-4 ml-0.5" aria-hidden="true" />
                )}
              </button>

              <button
                type="button"
                aria-label="Avançar 5 segundos"
                onClick={() => skipStudioSeconds(5)}
                className="h-7 w-7 rounded-md text-zinc-400 hover:text-zinc-100 flex items-center justify-center transition-colors"
              >
                <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
              </button>

              <span className="text-xs font-mono tabular-nums text-zinc-400">
                {formatMmSs(studioCurrentTime)} / {formatMmSs(studioDuration)}
              </span>
            </div>

            {/* Direita: Volume */}
            <div className="hidden md:flex items-center gap-2">
              <button
                type="button"
                aria-label={studioMuted ? "Ativar som" : "Silenciar"}
                onClick={() => {
                  const next = !studioMuted;
                  setStudioMuted(next);
                  if (studioAudioRef.current) {
                    studioAudioRef.current.muted = next;
                  }
                }}
                className="text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                {studioMuted ? (
                  <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
              <input
                type="range"
                aria-label="Volume do áudio"
                min={0}
                max={1}
                step={0.05}
                value={studioMuted ? 0 : studioVolume}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setStudioVolume(val);
                  setStudioMuted(val === 0);
                  if (studioAudioRef.current) {
                    studioAudioRef.current.volume = val;
                    studioAudioRef.current.muted = val === 0;
                  }
                }}
                className="w-16 accent-zinc-200 cursor-pointer h-1"
              />
            </div>
          </div>

          {/* Linha 2: Waveform Limpa Sem Borda Pesada + Marcadores de Minutagem */}
          <div
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.max(
                0,
                Math.min(1, (e.clientX - rect.left) / rect.width)
              );
              seekStudioAudioTo(ratio * Math.max(studioDuration, 1), false);
            }}
            className="relative h-7 cursor-pointer flex items-center select-none"
          >
            <div className="w-full h-full flex items-center justify-between gap-[2px]">
              {waveformBars.map((barHeight, idx) => {
                const progressRatio =
                  studioDuration > 0 ? studioCurrentTime / studioDuration : 0;
                const barRatio = idx / waveformBars.length;
                const isPlayed = barRatio <= progressRatio;
                return (
                  <span
                    key={idx}
                    style={{ height: `${barHeight}%` }}
                    className={`flex-1 rounded-full transition-colors duration-75 ${
                      isPlayed ? "bg-zinc-200" : "bg-zinc-800/80"
                    }`}
                  />
                );
              })}
            </div>

            {waveformMarkers.map((mk) => {
              const leftPct = Math.max(
                1,
                Math.min(99, (mk.seconds / Math.max(studioDuration, 1)) * 100)
              );
              return (
                <button
                  key={`${mk.label}_${mk.seconds}`}
                  type="button"
                  title={`[${mk.label}] ${mk.description}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    seekStudioAudioTo(mk.seconds, true);
                  }}
                  style={{ left: `${leftPct}%` }}
                  className="group/pin absolute top-0 bottom-0 -translate-x-1/2 z-20 flex flex-col items-center justify-center focus:outline-none"
                >
                  <span
                    className={`h-full w-[2px] rounded-full ${
                      mk.isFatal ? "bg-red-500" : "bg-amber-400"
                    }`}
                  />
                </button>
              );
            })}

            <div
              style={{
                left: `${Math.min(
                  100,
                  (studioCurrentTime / Math.max(studioDuration, 1)) * 100
                )}%`,
              }}
              className="absolute top-0 bottom-0 w-[1.5px] bg-zinc-100 pointer-events-none"
            />
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
