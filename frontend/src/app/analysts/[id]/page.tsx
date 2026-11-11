"use client";

import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Edit3,
  FileAudio,
  FileCheck2,
  FolderKanban,
  Hash,
  Headphones,
  Loader2,
  MessageSquare,
  Pause,
  Phone,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Search,
  ShieldAlert,
  Trash2,
  UploadCloud,
  User,
  UserCheck,
  Volume2,
  VolumeX,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { CallAudioPlayer } from "@/components/audio/CallAudioPlayer";
import { useAuth } from "@/context/AuthContext";
import {
  API_BASE_URL,
  callsApi,
  customersApi,
  evaluationsApi,
  extractErrorMessage,
  formsApi,
  usersApi,
} from "@/lib/api";
import {
  calculateLiveEvaluationScore,
  extractCleanPhoneDigits,
  formatDuration,
  formatPhoneMask,
} from "@/lib/utils";
import { CallRecord, CustomerInfo, FormTemplate } from "@/types";

type FlowStep = 1 | 2;

const AVAILABLE_SECTORS = ["SAC", "Cobrança & Retenção", "Aquisição"] as const;

const DIRECTUS_WEBHOOK_URL =
  process.env.NEXT_PUBLIC_CUSTOMER_WEBHOOK_URL || "";

function unwrapWebhookDataObject(
  raw: unknown
): Record<string, unknown> | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    return raw.length > 0 ? unwrapWebhookDataObject(raw[0]) : null;
  }
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const mergeSiblings = (inner: Record<string, unknown> | null) => {
      if (!inner) return obj;
      const merged: Record<string, unknown> = { ...inner };
      Object.entries(obj).forEach(([k, v]) => {
        if (
          k !== "data" &&
          k !== "output" &&
          k !== "result" &&
          v !== undefined &&
          v !== null &&
          merged[k] === undefined
        ) {
          merged[k] = v;
        }
      });
      return merged;
    };
    if (obj.data && typeof obj.data === "object") {
      return mergeSiblings(unwrapWebhookDataObject(obj.data));
    }
    if (obj.output && typeof obj.output === "object") {
      return mergeSiblings(unwrapWebhookDataObject(obj.output));
    }
    if (obj.result && typeof obj.result === "object") {
      return mergeSiblings(unwrapWebhookDataObject(obj.result));
    }
    return obj;
  }
  return null;
}

function parseCriterionBooleanValue(
  rawVal: unknown,
  isFatalError: boolean
): boolean | null {
  if (rawVal === undefined || rawVal === null) return null;
  if (typeof rawVal === "boolean") return rawVal;
  if (typeof rawVal === "number") return rawVal > 0;
  if (typeof rawVal === "string") {
    const clean = rawVal.trim().toLowerCase();
    if (!clean || clean === "undefined" || clean === "null") return null;
    if (
      clean === "true" ||
      clean === "sim" ||
      clean === "conforme" ||
      clean === "yes"
    ) {
      return true;
    }
    if (
      clean === "false" ||
      clean === "nao" ||
      clean === "não" ||
      clean === "n/a" ||
      clean === "0"
    ) {
      return false;
    }
    const num = Number(clean);
    if (!Number.isNaN(num)) {
      return isFatalError ? num > 0 : num > 0;
    }
  }
  return null;
}

interface CallRecordingSlot {
  id: string;
  file: File | null;
  previewUrl: string | null;
  durationSeconds: number;
  error: string | null;
}

function createEmptyRecordingSlot(): CallRecordingSlot {
  return {
    id: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    file: null,
    previewUrl: null,
    durationSeconds: 180,
    error: null,
  };
}

function resolveTemplateForSector(
  sectorName: string,
  templates: FormTemplate[]
): FormTemplate | null {
  if (templates.length === 0) return null;
  const s = (sectorName || "").toLowerCase();

  if (s.includes("sac") || s.includes("suporte")) {
    return (
      templates.find((t) => t.name.toLowerCase().includes("monitoria sac")) ||
      templates.find((t) => (t.sector || "").toLowerCase().includes("sac")) ||
      templates[0]
    );
  }
  if (s.includes("reten") || s.includes("cobran")) {
    return (
      templates.find(
        (t) =>
          t.name.toLowerCase().includes("monitoria retenção") ||
          t.name.toLowerCase().includes("monitoria retencao")
      ) ||
      templates.find((t) => (t.sector || "").toLowerCase().includes("reten")) ||
      templates[0]
    );
  }
  return (
    templates.find((t) => t.name.toLowerCase().includes("portabilidade")) ||
    templates.find((t) =>
      (t.sector || "").toLowerCase().includes("aquisi")
    ) ||
    templates[0]
  );
}

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
  motivoFaltaGrave: string,
  generalFeedback: string,
  fatalTriggered: boolean
): WaveformMarker[] {
  const markers: WaveformMarker[] = [];
  const seenSecs = new Set<number>();

  const scanText = (text: string, isFatalSource: boolean) => {
    if (!text || text === "N/A") return;
    const regex = /\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]([^;\n•\[]*)/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
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
          label: `${String(p1).padStart(2, "0")}:${String(p2).padStart(
            2,
            "0"
          )}`,
          description:
            rawDesc || (isFatalSource ? "Falta Grave" : "Observação QA"),
          isFatal: isFatalSource && fatalTriggered,
        });
      }
    }
  };

  scanText(motivoFaltaGrave, true);
  scanText(generalFeedback, false);
  return markers.sort((a, b) => a.seconds - b.seconds);
}

const WAVEFORM_BARS_HEIGHTS = Array.from({ length: 112 }, (_, i) => {
  const wave1 = Math.abs(Math.sin(i * 0.43) * 58);
  const wave2 = Math.abs(Math.cos(i * 0.19) * 32);
  const pulse = i % 7 === 0 ? 12 : i % 3 === 0 ? 22 : 16;
  return Math.max(14, Math.min(96, Math.round(wave1 + wave2 + pulse - 18)));
});

function AnalystEvaluationFlowInner() {
  const params = useParams<{ id: string }>();
  const analystId = params.id;
  const searchParams = useSearchParams();
  const initialSectorParam = searchParams.get("sector") || "";
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isGestor } = useAuth();

  const [step, setStep] = useState<FlowStep>(1);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [isSwitchingForm, setIsSwitchingForm] = useState(false);
  const initializedAnalystFormRef = useRef(false);

  // Campos Condicionais SAC / Retenção (Busca por Ticket sem # + Campos do Atendimento)
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [ticketInput, setTicketInput] = useState("");
  const [dataAtendimentoInput, setDataAtendimentoInput] = useState(todayIso);
  const [dataMonitoriaInput, setDataMonitoriaInput] = useState(todayIso);
  const [protocoloInput, setProtocoloInput] = useState("");
  const [telefoneOrigemInput, setTelefoneOrigemInput] = useState("");
  const [administradoraInput, setAdministradoraInput] = useState("");
  const [operadoraInput, setOperadoraInput] = useState("");
  const [situacaoInput, setSituacaoInput] = useState("");
  const [canalEntradaInput, setCanalEntradaInput] = useState("");
  const [motivoContatoInput, setMotivoContatoInput] = useState("");
  const [submotivoPlanoInput, setSubmotivoPlanoInput] = useState("");
  const [nomeAtendenteInput, setNomeAtendenteInput] = useState("");
  const lastLookedUpTicketRef = useRef<string>("");

  // Campos Padrão (Aquisição / Portabilidade: Telefone + 13 Campos de Venda)
  const [phoneInput, setPhoneInput] = useState("");
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [webhookSource, setWebhookSource] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const lastLookedUpDigitsRef = useRef<string>("");

  const [saleDateInput, setSaleDateInput] = useState("");
  const [customerNameInput, setCustomerNameInput] = useState("");
  const [customerCpfInput, setCustomerCpfInput] = useState("");
  const [birthDateInput, setBirthDateInput] = useState("");
  const [customerMotherInput, setCustomerMotherInput] = useState("");
  const [contractedPlanInput, setContractedPlanInput] = useState("");
  const [proposalInput, setProposalInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [paymentMethodInput, setPaymentMethodInput] = useState("");
  const [invoiceTypeInput, setInvoiceTypeInput] = useState("");
  const [fullAddressInput, setFullAddressInput] = useState("");
  const [dueDateInput, setDueDateInput] = useState("");
  const [earlyPortabilityInput, setEarlyPortabilityInput] = useState("");

  // Etapa 2: Lista Dinâmica de Múltiplas Ligações (1, 2, 3 ou mais)
  const [recordings, setRecordings] = useState<CallRecordingSlot[]>(() => [
    createEmptyRecordingSlot(),
  ]);
  const recordingsRef = useRef<CallRecordingSlot[]>(recordings);
  recordingsRef.current = recordings;

  const [selectedCall, setSelectedCall] = useState<CallRecord | null>(null);

  // Cleanup de todos os Blob URLs ao desmontar componente (zero vazamento de memória)
  useEffect(() => {
    return () => {
      recordingsRef.current.forEach((slot) => {
        if (slot.previewUrl) {
          URL.revokeObjectURL(slot.previewUrl);
        }
      });
    };
  }, []);

  // Etapa 3: Avaliar (Portabilidade / SAC / Retenção)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [checkedMap, setCheckedMap] = useState<Record<string, boolean>>({});
  const [observationMap, setObservationMap] = useState<Record<string, string>>(
    {}
  );
  const [generalFeedback, setGeneralFeedback] = useState("");
  const [pontosFortes, setPontosFortes] = useState("");
  const [melhorias, setMelhorias] = useState("");
  const [motivoFaltaGrave, setMotivoFaltaGrave] = useState("N/A");
  const [transcricaoInput, setTranscricaoInput] = useState("");
  const [aiSyncStatus, setAiSyncStatus] = useState<
    "IDLE" | "PROCESSING" | "COMPLETED" | "ERROR"
  >("IDLE");
  const [aiWebhookError, setAiWebhookError] = useState<string | null>(null);
  const [expandedNoteItemId, setExpandedNoteItemId] = useState<string | null>(
    null
  );

  // Studio Workstation (Passo 3 • Inspirado no ElevenLabs Studio)
  const studioAudioRef = useRef<HTMLAudioElement | null>(null);
  const [activeRecordingIdx, setActiveRecordingIdx] = useState(0);
  const [studioPlaying, setStudioPlaying] = useState(false);
  const [studioCurrentTime, setStudioCurrentTime] = useState(0);
  const [studioDuration, setStudioDuration] = useState(180);
  const [studioSpeed, setStudioSpeed] = useState(1);
  const [studioMuted, setStudioMuted] = useState(false);
  const [studioVolume, setStudioVolume] = useState(0.95);
  const [studioRightTab, setStudioRightTab] = useState<
    "criteria" | "observations" | "customer"
  >("criteria");
  const [studioTranscriptMode, setStudioTranscriptMode] = useState<
    "conversation" | "raw"
  >("conversation");
  const [transcriptSearch, setTranscriptSearch] = useState("");
  const [criteriaFilter, setCriteriaFilter] = useState<"ALL" | "UNCHECKED">(
    "ALL"
  );
  const [copiedVarKey, setCopiedVarKey] = useState<string | null>(null);

  const activeStudioRecording =
    recordings[activeRecordingIdx] || recordings[0] || null;
  const activeStudioAudioUrl = useMemo(() => {
    const raw =
      activeStudioRecording?.previewUrl || selectedCall?.audioUrl || "";
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
  }, [activeStudioRecording?.previewUrl, selectedCall?.audioUrl]);

  useEffect(() => {
    setStudioPlaying(false);
    setStudioCurrentTime(0);
    setStudioDuration(
      activeStudioRecording?.durationSeconds ||
        selectedCall?.durationSeconds ||
        180
    );
  }, [
    activeRecordingIdx,
    activeStudioAudioUrl,
    activeStudioRecording?.durationSeconds,
    selectedCall?.durationSeconds,
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
    async (targetSeconds: number, autoPlay = false) => {
      const audio = studioAudioRef.current;
      const clamped = Math.max(
        0,
        Math.min(studioDuration || 3600, targetSeconds)
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

  // Atalhos de Teclado Ergonômicos na Etapa 2 (Espaço = Play/Pause, Setas = ±5s)
  useEffect(() => {
    if (step !== 2) return;
    const handleKeyDown = (e: KeyboardEvent) => {
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
  }, [step, toggleStudioPlay, skipStudioSeconds]);

  const parsedTranscriptTurns = useMemo(
    () => parseTranscriptTurns(transcricaoInput),
    [transcricaoInput]
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

  const transcriptContainerRef = useRef<HTMLDivElement | null>(null);

  const activeTurnIndex = useMemo(() => {
    if (studioCurrentTime <= 0 || parsedTranscriptTurns.length === 0) return -1;
    for (let i = parsedTranscriptTurns.length - 1; i >= 0; i--) {
      if (studioCurrentTime >= parsedTranscriptTurns[i].startSeconds) {
        return parsedTranscriptTurns[i].index;
      }
    }
    return -1;
  }, [parsedTranscriptTurns, studioCurrentTime]);

  // Auto-scroll suave da conversa conforme o áudio flui
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

  const { data: analyst, isLoading: isAnalystLoading } = useQuery({
    queryKey: ["analyst-profile", analystId],
    queryFn: () => usersApi.getById(analystId),
    enabled: !!analystId && isGestor,
  });

  // Setor fixo do analista (a alteração de setor ocorre exclusivamente na tela /analysts)
  const analystSector = useMemo(
    () => analyst?.department || initialSectorParam || "SAC",
    [analyst?.department, initialSectorParam]
  );

  const { data: existingTemplates = [], isLoading: isTemplatesLoading } =
    useQuery({
      queryKey: ["active-forms"],
      queryFn: () => formsApi.list(true),
      enabled: isGestor,
    });

  const applyTemplateSelection = useCallback((tpl: FormTemplate) => {
    setSelectedTemplateId(tpl.id);
    const initialChecks: Record<string, boolean> = {};
    tpl.items.forEach((item) => {
      initialChecks[item.id] = !item.fatalError;
    });
    setCheckedMap(initialChecks);
    setObservationMap({});
  }, []);

  // Inicializa o formulário correspondente ao setor do analista assim que os dados carregarem
  useEffect(() => {
    if (existingTemplates.length === 0) return;
    const targetSector = analyst?.department || initialSectorParam;
    if (!targetSector) return;

    if (!initializedAnalystFormRef.current) {
      initializedAnalystFormRef.current = true;
      const matched = resolveTemplateForSector(targetSector, existingTemplates);
      if (matched) {
        applyTemplateSelection(matched);
      }
    }
  }, [
    analyst?.department,
    existingTemplates,
    initialSectorParam,
    applyTemplateSelection,
  ]);

  const activeFormForCall = useMemo<FormTemplate | null>(() => {
    if (existingTemplates.length === 0) return null;
    if (selectedTemplateId) {
      const found = existingTemplates.find((t) => t.id === selectedTemplateId);
      if (found) return found;
    }
    return resolveTemplateForSector(analystSector, existingTemplates);
  }, [existingTemplates, selectedTemplateId, analystSector]);

  const applyAiEvaluationPayload = useCallback(
    (rawPayload: unknown, targetForm: FormTemplate | null) => {
      const dataMap = unwrapWebhookDataObject(rawPayload);
      if (!dataMap) return false;

      let appliedAny = false;

      const rawTranscricao =
        (typeof dataMap.Transcricao === "string" && dataMap.Transcricao) ||
        (typeof dataMap.transcricao === "string" && dataMap.transcricao) ||
        (typeof dataMap.transcription === "string" && dataMap.transcription) ||
        (typeof dataMap.transcript === "string" && dataMap.transcript) ||
        (typeof dataMap.texto === "string" && dataMap.texto) ||
        (typeof dataMap.text === "string" && dataMap.text) ||
        "";
      const minGraves =
        typeof dataMap.minutagem_faltas_graves === "string" &&
        dataMap.minutagem_faltas_graves.trim() &&
        dataMap.minutagem_faltas_graves.trim().toUpperCase() !== "N/A"
          ? dataMap.minutagem_faltas_graves.trim()
          : "";
      const minComuns =
        typeof dataMap.minutagem_falhas_comuns === "string" &&
        dataMap.minutagem_falhas_comuns.trim() &&
        dataMap.minutagem_falhas_comuns.trim().toUpperCase() !== "N/A"
          ? dataMap.minutagem_falhas_comuns.trim()
          : "";

      if (rawTranscricao.trim()) {
        setTranscricaoInput(
          rawTranscricao
            .replace(/^```\n?/, "")
            .replace(/\n?```$/, "")
            .trim()
        );
        appliedAny = true;
      }

      // Aplica campos do fluxo de SAC e Retenção quando retornados pelo webhook
      const pickStr = (...keys: string[]) => {
        for (const k of keys) {
          const v = dataMap[k];
          if (v !== undefined && v !== null && String(v).trim() !== "") {
            return String(v).trim();
          }
        }
        return "";
      };

      const incomingTicket = pickStr("ticket_id", "ticket", "Ticket").replace(
        /#/g,
        ""
      );
      if (incomingTicket) {
        setTicketInput(incomingTicket);
        appliedAny = true;
      }
      const incomingProtocolo = pickStr("protocolo", "Protocolo");
      if (incomingProtocolo) {
        setProtocoloInput(incomingProtocolo);
        appliedAny = true;
      }
      const incomingNome = pickStr("nome_completo", "Nome", "nome");
      if (incomingNome) {
        setCustomerNameInput(incomingNome);
        appliedAny = true;
      }
      const incomingCpf = pickStr("cpf", "CPF");
      if (incomingCpf) {
        setCustomerCpfInput(incomingCpf);
        appliedAny = true;
      }
      const incomingTelOrigem = pickStr(
        "telefone_origem",
        "Telefone_Portabilidade",
        "telefone"
      );
      if (incomingTelOrigem) {
        setTelefoneOrigemInput(incomingTelOrigem);
        appliedAny = true;
      }
      const incomingAdmin = pickStr("administradora");
      if (incomingAdmin) {
        setAdministradoraInput(incomingAdmin);
        appliedAny = true;
      }
      const incomingOperadora = pickStr("operadora");
      if (incomingOperadora) {
        setOperadoraInput(incomingOperadora);
        appliedAny = true;
      }
      const incomingSituacao = pickStr("situacao");
      if (incomingSituacao) {
        setSituacaoInput(incomingSituacao);
        appliedAny = true;
      }
      const incomingCanal = pickStr("canal_de_entrada");
      if (incomingCanal) {
        setCanalEntradaInput(incomingCanal);
        appliedAny = true;
      }
      const incomingMotivo = pickStr("motivo_contato");
      if (incomingMotivo) {
        setMotivoContatoInput(incomingMotivo);
        appliedAny = true;
      }
      const incomingSubmotivo = pickStr("submotivo_plano");
      if (incomingSubmotivo) {
        setSubmotivoPlanoInput(incomingSubmotivo);
        appliedAny = true;
      }
      const incomingAtendente = pickStr("nome_atendente");
      if (incomingAtendente) {
        setNomeAtendenteInput(incomingAtendente);
        appliedAny = true;
      }

      const formatTimestampedLines = (raw: string) =>
        raw
          .split(/\s*;\s*|\n+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .map((line) => (line.startsWith("•") ? line : `• ${line}`))
          .join("\n");

      const rawObs =
        (typeof dataMap.Observacoes === "string" && dataMap.Observacoes) ||
        (typeof dataMap.Breve_resumo_do_atendimento === "string" &&
          dataMap.Breve_resumo_do_atendimento) ||
        "";

      const timestampBlocks: string[] = [];
      if (minGraves && !rawObs.includes(minGraves)) {
        timestampBlocks.push(
          `Minutagem de Faltas Graves (Minuto e Segundo):\n${formatTimestampedLines(minGraves)}`
        );
      }
      if (minComuns && !rawObs.includes(minComuns)) {
        timestampBlocks.push(
          `Minutagem de Falhas / Observações (Minuto e Segundo):\n${formatTimestampedLines(minComuns)}`
        );
      }

      const fullObsWithTimestamps = [rawObs.trim(), ...timestampBlocks]
        .filter(Boolean)
        .join("\n\n");

      if (fullObsWithTimestamps) {
        setGeneralFeedback(fullObsWithTimestamps);
        appliedAny = true;
      }

      if (typeof dataMap.Pontos_fortes === "string" && dataMap.Pontos_fortes) {
        setPontosFortes(dataMap.Pontos_fortes.trim());
      }
      if (typeof dataMap.Melhorias === "string" && dataMap.Melhorias) {
        setMelhorias(dataMap.Melhorias.trim());
      }
      if (
        typeof dataMap.Motivo_falta_grave === "string" &&
        dataMap.Motivo_falta_grave
      ) {
        const rawMotivo = dataMap.Motivo_falta_grave.trim();
        const enrichedMotivo =
          minGraves && !rawMotivo.includes("[")
            ? `${minGraves} — ${rawMotivo}`
            : rawMotivo;
        setMotivoFaltaGrave(enrichedMotivo);
      }

      if (targetForm && targetForm.items.length > 0) {
        const nextChecked: Record<string, boolean> = {};
        let matchedCriteriaCount = 0;

        targetForm.items.forEach((item) => {
          const bulletIdx = item.label.indexOf("•");
          const criterionKey =
            bulletIdx > 0
              ? item.label.substring(0, bulletIdx).trim()
              : item.label.trim();

          let rawCriterionVal = dataMap[criterionKey];
          if (
            rawCriterionVal === undefined &&
            criterionKey === "Faz_questionamentos_direcionados"
          ) {
            rawCriterionVal = dataMap["Questionamentos_direcionados"];
          }
          if (rawCriterionVal === undefined && item.fatalError) {
            rawCriterionVal =
              dataMap["Falta_Grave"] !== undefined
                ? dataMap["Falta_Grave"]
                : dataMap["falta_grave"];
          }

          const parsedBool = parseCriterionBooleanValue(
            rawCriterionVal,
            item.fatalError
          );
          if (parsedBool !== null) {
            nextChecked[item.id] = parsedBool;
            matchedCriteriaCount++;
          } else {
            nextChecked[item.id] = !item.fatalError;
          }
        });

        if (matchedCriteriaCount > 0) {
          setCheckedMap(nextChecked);
          appliedAny = true;
        }
      }

      if (appliedAny) {
        setAiSyncStatus("COMPLETED");
      }
      return appliedAny;
    },
    []
  );

  // Polling automático na Etapa 2 enquanto aguarda retorno da transcrição completa e dados do webhook n8n
  useEffect(() => {
    const hasFullTranscript = transcricaoInput.trim().length >= 100;
    if (
      step !== 2 ||
      !selectedCall?.id ||
      (aiSyncStatus === "COMPLETED" && hasFullTranscript) ||
      aiSyncStatus === "ERROR"
    ) {
      return;
    }

    let cancelled = false;
    const checkCallMetadata = async () => {
      try {
        const latestCall = await callsApi.getById(selectedCall.id);
        if (cancelled) return;
        const meta = latestCall.metadata || {};
        if (typeof meta.transcricao === "string" && meta.transcricao.trim()) {
          setTranscricaoInput(
            meta.transcricao
              .replace(/^```\n?/, "")
              .replace(/\n?```$/, "")
              .trim()
          );
        }
        if (meta.aiEvaluationData) {
          setAiWebhookError(null);
          const payloadWithTranscricao =
            typeof meta.aiEvaluationData === "object" &&
            meta.aiEvaluationData !== null
              ? {
                  ...(meta.aiEvaluationData as Record<string, unknown>),
                  ...(typeof meta.transcricao === "string" &&
                  meta.transcricao.trim()
                    ? { transcricao: meta.transcricao }
                    : {}),
                }
              : meta.aiEvaluationData;
          applyAiEvaluationPayload(payloadWithTranscricao, activeFormForCall);
        } else if (
          typeof meta.transcricao === "string" &&
          meta.transcricao.trim()
        ) {
          setAiWebhookError(null);
          setAiSyncStatus("COMPLETED");
        } else if (meta.aiWebhookStatus === "ERROR") {
          setAiSyncStatus("ERROR");
          setAiWebhookError(
            typeof meta.aiWebhookError === "string"
              ? meta.aiWebhookError
              : "O webhook n8n retornou erro ou está inativo."
          );
        }
      } catch {
        // Ignora falhas transitórias de rede durante polling
      }
    };

    checkCallMetadata();
    const interval = setInterval(checkCallMetadata, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    step,
    selectedCall?.id,
    aiSyncStatus,
    transcricaoInput,
    activeFormForCall,
    applyAiEvaluationPayload,
  ]);
  const effectiveEvaluationSector = useMemo(() => {
    const formContext = `${activeFormForCall?.sector || ""} ${
      activeFormForCall?.name || ""
    }`.toLowerCase();
    if (
      formContext.includes("portabilidade") ||
      formContext.includes("aquisi")
    ) {
      return "Aquisição";
    }
    if (formContext.includes("reten") || formContext.includes("cobran")) {
      return "Cobrança & Retenção";
    }
    if (formContext.includes("sac")) {
      return "SAC";
    }
    return analystSector;
  }, [activeFormForCall, analystSector]);

  const isSacOrRetencao = useMemo(() => {
    const s = effectiveEvaluationSector.toLowerCase();
    if (s.includes("portabilidade") || s.includes("aquisi")) {
      return false;
    }
    return (
      s.includes("sac") ||
      s.includes("reten") ||
      s.includes("cobran") ||
      s.includes("suporte")
    );
  }, [effectiveEvaluationSector]);

  const resetCustomerFieldsForModeSwitch = useCallback(
    (nextIsSacRet: boolean) => {
      setFlowError(null);
      if (nextIsSacRet) {
        setPhoneInput("");
        setCustomerInfo(null);
        setWebhookSource(null);
        lastLookedUpDigitsRef.current = "";
        setSaleDateInput("");
        setCustomerNameInput("");
        setCustomerCpfInput("");
        setBirthDateInput("");
        setCustomerMotherInput("");
        setContractedPlanInput("");
        setProposalInput("");
        setEmailInput("");
        setPaymentMethodInput("");
        setInvoiceTypeInput("");
        setFullAddressInput("");
        setDueDateInput("");
        setEarlyPortabilityInput("");
      } else {
        setTicketInput("");
        setDataAtendimentoInput(todayIso);
        setDataMonitoriaInput(todayIso);
        setProtocoloInput("");
        setTelefoneOrigemInput("");
        setAdministradoraInput("");
        setOperadoraInput("");
        setSituacaoInput("");
        setCanalEntradaInput("");
        setMotivoContatoInput("");
        setSubmotivoPlanoInput("");
        setNomeAtendenteInput("");
        lastLookedUpTicketRef.current = "";
      }
    },
    [todayIso]
  );

  // Handler para trocar o formulário selecionado no topo da tela de avaliação
  const handleFormTemplateSelect = useCallback(
    (templateId: string) => {
      const chosen = existingTemplates.find((t) => t.id === templateId);
      if (!chosen || chosen.id === selectedTemplateId) return;

      setIsSwitchingForm(true);
      applyTemplateSelection(chosen);

      const chosenContext = `${chosen.sector || ""} ${
        chosen.name || ""
      }`.toLowerCase();
      const nextIsSacRet =
        chosenContext.includes("sac") ||
        chosenContext.includes("reten") ||
        chosenContext.includes("cobran");
      resetCustomerFieldsForModeSwitch(nextIsSacRet);

      setTimeout(() => setIsSwitchingForm(false), 150);
    },
    [
      applyTemplateSelection,
      existingTemplates,
      resetCustomerFieldsForModeSwitch,
      selectedTemplateId,
    ]
  );

  const applyCustomerFields = useCallback((cust: CustomerInfo) => {
    setCustomerInfo(cust);
    const cleanName =
      cust.name &&
      !cust.name.startsWith("Contato ") &&
      !cust.name.startsWith("Cliente ")
        ? cust.name
        : "";
    const cleanDoc =
      cust.document && cust.document !== "000.000.000-00" ? cust.document : "";
    setSaleDateInput(cust.saleDate || "");
    setCustomerNameInput(cleanName);
    setCustomerCpfInput(cleanDoc);
    setBirthDateInput(cust.birthDate || "");
    setCustomerMotherInput(cust.motherName || "");
    setContractedPlanInput(cust.contractedPlan || "");
    setProposalInput(cust.proposal || "");
    setEmailInput(cust.email || "");
    setPaymentMethodInput(cust.paymentMethod || "");
    setInvoiceTypeInput(cust.invoiceType || "");
    setFullAddressInput(cust.fullAddress || "");
    setDueDateInput(cust.dueDate || "");
    setEarlyPortabilityInput(cust.earlyPortability || "");
  }, []);

  const pullTicketFromWebhook = useCallback(
    async (rawTicket: string, force = false) => {
      const cleanTicket = rawTicket.replace(/#/g, "").trim();
      if (cleanTicket.length < 4) return;
      if (!force && lastLookedUpTicketRef.current === cleanTicket) return;

      lastLookedUpTicketRef.current = cleanTicket;
      setFlowError(null);
      setLookupLoading(true);
      try {
        const res = await customersApi.triggerWebhookLookup({
          searchKey: cleanTicket,
          keyType: "TICKET",
          analystId,
        });
        if (res.rawData && Object.keys(res.rawData).length > 0) {
          applyAiEvaluationPayload(res.rawData, activeFormForCall);
        } else if (res.customer) {
          if (res.customer.name) setCustomerNameInput(res.customer.name);
          if (res.customer.document) setCustomerCpfInput(res.customer.document);
          if (res.customer.phone) setTelefoneOrigemInput(res.customer.phone);
          if (res.customer.protocol) setProtocoloInput(res.customer.protocol);
        }
        setWebhookSource(res.source);
      } catch (err) {
        setFlowError(extractErrorMessage(err));
      } finally {
        setLookupLoading(false);
      }
    },
    [analystId, activeFormForCall, applyAiEvaluationPayload]
  );

  const pullContactFromWebhook = useCallback(
    async (rawPhone: string, force = false) => {
      const cleanDigits = extractCleanPhoneDigits(rawPhone);
      if (cleanDigits.length < 10) return;
      if (!force && lastLookedUpDigitsRef.current === cleanDigits) return;

      lastLookedUpDigitsRef.current = cleanDigits;
      setFlowError(null);
      setLookupLoading(true);
      try {
        const res = await customersApi.triggerWebhookLookup({
          phone: cleanDigits,
          searchKey: cleanDigits,
          cpf: customerCpfInput || undefined,
          motherName: customerMotherInput || undefined,
          name: customerNameInput || undefined,
          keyType: "TELEFONE",
          analystId,
          webhookUrl: DIRECTUS_WEBHOOK_URL,
        });
        applyCustomerFields(res.customer);
        setWebhookSource(res.source);
      } catch (err) {
        setFlowError(extractErrorMessage(err));
      } finally {
        setLookupLoading(false);
      }
    },
    [
      analystId,
      applyCustomerFields,
      customerCpfInput,
      customerMotherInput,
      customerNameInput,
    ]
  );

  // Auto-pull por telefone apenas quando o setor NÃO for SAC/Retenção
  useEffect(() => {
    if (isSacOrRetencao) return;
    const cleanDigits = extractCleanPhoneDigits(phoneInput);
    if (cleanDigits.length >= 10 && cleanDigits.length <= 11) {
      const timer = setTimeout(() => {
        pullContactFromWebhook(phoneInput);
      }, 320);
      return () => clearTimeout(timer);
    }
  }, [phoneInput, pullContactFromWebhook, isSacOrRetencao]);

  const handleProceedToStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    setFlowError(null);

    if (isSacOrRetencao) {
      const cleanTicket = ticketInput.replace(/#/g, "").trim();
      if (!cleanTicket) {
        setFlowError(
          "Informe o número do Ticket (sem #) para prosseguir com a avaliação de " +
            analystSector +
            "."
        );
        return;
      }
      setTicketInput(cleanTicket);
      if (!dataAtendimentoInput) {
        setFlowError("Informe a Data do Atendimento.");
        return;
      }
      if (!dataMonitoriaInput) {
        setFlowError("Informe a Data da Monitoria.");
        return;
      }
      uploadAttachmentMutation.mutate();
      return;
    }

    const cleanDigits = extractCleanPhoneDigits(phoneInput);
    if (cleanDigits.length < 8) {
      setFlowError(
        "Informe um Telefone válido (mínimo 8 dígitos) para prosseguir."
      );
      return;
    }

    setLookupLoading(true);
    try {
      let currentCustomer = customerInfo;
      if (
        !currentCustomer ||
        extractCleanPhoneDigits(currentCustomer.phone) !== cleanDigits
      ) {
        const res = await customersApi.triggerWebhookLookup({
          phone: cleanDigits,
          searchKey: cleanDigits,
          cpf: customerCpfInput || undefined,
          motherName: customerMotherInput || undefined,
          name: customerNameInput || undefined,
          keyType: "TELEFONE",
          analystId,
          webhookUrl: DIRECTUS_WEBHOOK_URL,
        });
        currentCustomer = res.customer;
        applyCustomerFields(res.customer);
        setWebhookSource(res.source);
      } else if (
        currentCustomer.id &&
        customerNameInput.trim() &&
        customerCpfInput.trim()
      ) {
        const updated = await customersApi.saveCustomerData(
          currentCustomer.id,
          {
            phone: cleanDigits || currentCustomer.phone,
            saleDate: saleDateInput.trim(),
            name: customerNameInput.trim(),
            document: customerCpfInput.trim(),
            birthDate: birthDateInput.trim(),
            motherName: customerMotherInput.trim(),
            contractedPlan: contractedPlanInput.trim(),
            proposal: proposalInput.trim(),
            email: emailInput.trim(),
            paymentMethod: paymentMethodInput.trim(),
            invoiceType: invoiceTypeInput.trim(),
            fullAddress: fullAddressInput.trim(),
            dueDate: dueDateInput.trim(),
            earlyPortability: earlyPortabilityInput.trim(),
          }
        );
        setCustomerInfo(updated);
      }
      uploadAttachmentMutation.mutate();
    } catch (err) {
      setFlowError(extractErrorMessage(err));
    } finally {
      setLookupLoading(false);
    }
  };

  // Gerenciamento da Lista Dinâmica de Múltiplas Ligações (Passo 2)
  const handleAddRecordingSlot = useCallback(() => {
    setRecordings((prev) => [...prev, createEmptyRecordingSlot()]);
  }, []);

  const handleRemoveRecordingSlot = useCallback((slotId: string) => {
    setRecordings((prev) => {
      if (prev.length <= 1) return prev;
      const target = prev.find((r) => r.id === slotId);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((r) => r.id !== slotId);
    });
  }, []);

  const handleRecordingFileSelect = useCallback(
    (slotId: string, file: File | null) => {
      if (!file) return;
      const objUrl = URL.createObjectURL(file);

      setRecordings((prev) =>
        prev.map((slot) => {
          if (slot.id !== slotId) return slot;
          if (slot.previewUrl) {
            URL.revokeObjectURL(slot.previewUrl);
          }
          return {
            ...slot,
            file,
            previewUrl: objUrl,
            error: null,
          };
        })
      );

      const tempAudio = new Audio(objUrl);
      tempAudio.addEventListener("loadedmetadata", () => {
        if (tempAudio.duration && isFinite(tempAudio.duration)) {
          const detectedSecs = Math.max(1, Math.round(tempAudio.duration));
          setRecordings((prev) =>
            prev.map((slot) =>
              slot.id === slotId
                ? { ...slot, durationSeconds: detectedSecs }
                : slot
            )
          );
        }
      });
    },
    []
  );

  const uploadAttachmentMutation = useMutation({
    mutationFn: async () => {
      setFlowError(null);

      // Validação individual de cada ligação adicionada na lista
      let hasMissingFile = false;
      setRecordings((prev) =>
        prev.map((slot, idx) => {
          if (!slot.file) {
            hasMissingFile = true;
            return {
              ...slot,
              error: `Anexe o arquivo de áudio da Ligação #${
                idx + 1
              } ou remova este item.`,
            };
          }
          return { ...slot, error: null };
        })
      );

      if (hasMissingFile) {
        throw new Error(
          "Todas as ligações adicionadas precisam ter um arquivo de áudio válido antes de avançar."
        );
      }

      const validFiles = recordings.map((r) => r.file!);
      const durationsList = recordings.map((r) => r.durationSeconds || 180);
      const totalDuration = durationsList.reduce((acc, d) => acc + d, 0);

      const cleanTicket = ticketInput.replace(/#/g, "").trim();

      const resolvedPhoneKey = isSacOrRetencao
        ? extractCleanPhoneDigits(telefoneOrigemInput) ||
          cleanTicket ||
          "11999999999"
        : extractCleanPhoneDigits(phoneInput) ||
          phoneInput ||
          customerInfo?.phone ||
          "11999999999";

      const resolvedCustomerName = isSacOrRetencao
        ? customerNameInput.trim() || `Ticket ${cleanTicket}`
        : customerNameInput;

      const resolvedCampaign = isSacOrRetencao
        ? `${effectiveEvaluationSector} • Ticket ${cleanTicket}`
        : `${effectiveEvaluationSector} • Portabilidade`;

      return callsApi.uploadRecording({
        files: validFiles,
        file: validFiles[0],
        analystId,
        customerPhone: resolvedPhoneKey,
        customerName: resolvedCustomerName,
        campaign: resolvedCampaign,
        durationSeconds: totalDuration,
        durations: durationsList,
        ticket: isSacOrRetencao ? cleanTicket : undefined,
        attendanceDate: isSacOrRetencao ? dataAtendimentoInput : undefined,
        monitoringDate: isSacOrRetencao ? dataMonitoriaInput : undefined,
        sector: effectiveEvaluationSector,
        formTemplateId: activeFormForCall?.id,
      });
    },
    onSuccess: (createdCall) => {
      setSelectedCall(createdCall);
      setTranscricaoInput("");
      setAiWebhookError(null);
      setAiSyncStatus("PROCESSING");
      queryClient.invalidateQueries({ queryKey: ["calls-list"] });
      setStep(2);

      // O backend (CallRecordService) faz o upload do áudio para o Directus/R2 e dispara o webhook n8n;
      // o useEffect de polling da Etapa 3 busca o resultado completo assim que o n8n concluir.
      const meta = createdCall.metadata || {};
      if (meta.aiEvaluationData || meta.transcricao) {
        const payloadWithTranscricao =
          typeof meta.aiEvaluationData === "object" &&
          meta.aiEvaluationData !== null
            ? {
                ...(meta.aiEvaluationData as Record<string, unknown>),
                ...(typeof meta.transcricao === "string" &&
                meta.transcricao.trim()
                  ? { transcricao: meta.transcricao }
                  : {}),
              }
            : { transcricao: meta.transcricao };
        applyAiEvaluationPayload(payloadWithTranscricao, activeFormForCall);
      }
    },
    onError: (err) => {
      setFlowError(extractErrorMessage(err));
    },
  });

  const standardItems = useMemo(
    () =>
      activeFormForCall
        ? activeFormForCall.items.filter((i) => !i.fatalError)
        : [],
    [activeFormForCall]
  );

  const fatalItems = useMemo(
    () =>
      activeFormForCall
        ? activeFormForCall.items.filter((i) => i.fatalError)
        : [],
    [activeFormForCall]
  );

  const liveScore = useMemo(
    () => calculateLiveEvaluationScore(activeFormForCall, checkedMap),
    [activeFormForCall, checkedMap]
  );

  const submitEvaluationMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCall || !activeFormForCall) {
        throw new Error("Chamada ou formulário não selecionado.");
      }
      const parts: string[] = [];
      if (isSacOrRetencao && ticketInput.trim()) {
        parts.push(`[Ticket Zendesk]: ${ticketInput.trim()}`);
        parts.push(
          `[Data do Atendimento]: ${dataAtendimentoInput} | [Data da Monitoria]: ${dataMonitoriaInput}`
        );
      } else if (!isSacOrRetencao && proposalInput.trim()) {
        parts.push(`[Proposta]: ${proposalInput.trim()}`);
      }
      if (recordings.length > 1) {
        parts.push(`[Ligações Anexadas]: ${recordings.length} gravações`);
      }
      if (generalFeedback.trim()) {
        parts.push(generalFeedback.trim());
      }
      if (pontosFortes.trim()) {
        parts.push(`Pontos Fortes: ${pontosFortes.trim()}`);
      }
      if (melhorias.trim()) {
        parts.push(`Pontos de Melhoria: ${melhorias.trim()}`);
      }
      if (
        liveScore.fatalTriggered &&
        motivoFaltaGrave.trim() &&
        motivoFaltaGrave.trim() !== "N/A"
      ) {
        parts.push(`Motivo Falta Grave: ${motivoFaltaGrave.trim()}`);
      }

      const answers = activeFormForCall.items.map((item) => ({
        formItemId: item.id,
        checked: !!checkedMap[item.id],
        observation: observationMap[item.id] || undefined,
      }));

      return evaluationsApi.submit({
        callRecordId: selectedCall.id,
        formTemplateId: activeFormForCall.id,
        answers,
        generalFeedback: parts.join("\n\n") || undefined,
        transcricao: transcricaoInput.trim() || undefined,
      });
    },
    onSuccess: (createdEval) => {
      queryClient.invalidateQueries({ queryKey: ["evaluations-list"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["calls-list"] });
      router.push(`/evaluations/${createdEval.id}`);
    },
    onError: (err) => {
      setFlowError(extractErrorMessage(err));
    },
  });

  if (!isGestor) {
    return (
      <AppShell>
        <div className="p-6 rounded-xl border border-red-800 bg-red-950/40 text-red-200 text-xs">
          Acesso restrito a Gestores e Administradores.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div
        className={
          step === 2
            ? "h-full flex flex-col overflow-hidden bg-[#0b0b0d]"
            : "h-full overflow-y-auto p-4 sm:p-6 space-y-5 pb-12"
        }
      >
        {/* Barra Superior Minimalista de 1 Linha (Estilo ElevenLabs Studio Header) */}
        <header
          className={
            step === 2
              ? "h-12 px-5 border-b border-zinc-800/70 bg-[#0b0b0d] flex items-center justify-between gap-4 shrink-0"
              : "flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80 shrink-0"
          }
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Link
              href="/analysts"
              aria-label="Voltar para Analistas"
              className="h-7 w-7 rounded-md border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 flex items-center justify-center transition-colors shrink-0 focus-visible:ring-1 focus-visible:ring-zinc-400"
              title="Voltar para Analistas"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>

            <h1 className="text-sm font-semibold text-zinc-100 truncate">
              {analyst?.name || "Carregando…"}
            </h1>

            <span className="px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800/80 text-[10px] font-mono uppercase tracking-wider text-zinc-400 shrink-0">
              {analystSector}
            </span>

            <span className="text-zinc-700 hidden sm:inline" aria-hidden="true">
              /
            </span>

            {/* Seletor de Formulário Minimalista Inline */}
            <div className="hidden sm:inline-flex items-center gap-1.5 h-7 px-2 rounded-md border border-zinc-800/80 bg-zinc-900/40 hover:border-zinc-700 transition-colors">
              <select
                value={activeFormForCall?.id || ""}
                onChange={(e) => handleFormTemplateSelect(e.target.value)}
                disabled={isSwitchingForm || existingTemplates.length === 0}
                aria-label="Selecione o formulário de avaliação"
                className="bg-transparent text-xs text-zinc-300 focus:outline-none cursor-pointer max-w-[220px] truncate"
              >
                {existingTemplates.map((tpl) => (
                  <option
                    key={tpl.id}
                    value={tpl.id}
                    className="bg-[#0b0b0d] text-zinc-100"
                  >
                    {tpl.name} ({tpl.maxPossiblePoints} pts)
                  </option>
                ))}
              </select>
              {isSwitchingForm && (
                <Loader2
                  className="h-3 w-3 animate-spin text-zinc-400"
                  aria-hidden="true"
                />
              )}
            </div>
          </div>

          {/* Direita: Stepper Compacto + Placar + Botão Publicar (No Passo 3) */}
          <div className="flex items-center gap-3 shrink-0">
            <nav
              aria-label="Etapas da avaliação"
              className="hidden md:flex items-center gap-1 bg-zinc-900/60 p-0.5 rounded-lg border border-zinc-800/80"
            >
              {(
                [
                  { num: 1, label: "1. Cliente & Áudio" },
                  { num: 2, label: "2. Avaliar" },
                ] as const
              ).map((s) => {
                const active = step === s.num;
                const done = step > s.num;
                return (
                  <button
                    key={s.num}
                    type="button"
                    disabled={s.num > step}
                    onClick={() => setStep(s.num)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1 ${
                      active
                        ? "bg-zinc-100 text-zinc-950 font-semibold"
                        : done
                        ? "text-zinc-300 hover:text-zinc-100"
                        : "text-zinc-600 cursor-not-allowed"
                    }`}
                  >
                    {done && (
                      <Check
                        className="h-3 w-3 text-emerald-400 shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    <span>{s.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </header>

        {flowError && (
          <div
            role="alert"
            aria-live="polite"
            className="mx-5 mt-2 p-2.5 rounded-lg border border-red-900/80 bg-red-950/40 text-red-200 text-xs flex items-center gap-2 shrink-0"
          >
            <AlertCircle
              className="h-4 w-4 shrink-0 text-red-400"
              aria-hidden="true"
            />
            <span>{flowError}</span>
          </div>
        )}

        {/* Skeleton leve durante carregamento inicial ou troca de formulário */}
        {isAnalystLoading || isTemplatesLoading || isSwitchingForm ? (
          <div className="max-w-4xl p-6 rounded-xl border border-zinc-800/90 bg-[#0b0b0d] space-y-4">
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin text-zinc-200" />
              <span>
                Carregando estrutura do formulário{" "}
                <strong className="text-zinc-100">
                  {activeFormForCall?.name || "..."}
                </strong>
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-16 rounded-lg bg-zinc-900/70 border border-zinc-800/80 animate-pulse"
                />
              ))}
            </div>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {/* ====================================================================
                STEP 1: DADOS DO CLIENTE (CONDICIONAL POR SETOR: SAC/RETENÇÃO vs AQUISIÇÃO)
               ==================================================================== */}
            {step === 1 && (
              <motion.div
                key={`step-1-${isSacOrRetencao ? "sac-ret" : "aquisicao"}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="max-w-4xl p-5 rounded-xl border border-zinc-800/90 bg-[#0b0b0d] space-y-5"
              >
                <form onSubmit={handleProceedToStep2} className="space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-800/80">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-zinc-400" />
                      <h2 className="text-sm font-bold text-zinc-100">
                        Dados do Cliente •{" "}
                        <span className="text-zinc-300 font-mono">
                          {activeFormForCall?.name || analystSector}
                        </span>
                      </h2>
                    </div>

                    {lookupLoading ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-zinc-300">
                        <Loader2 className="h-3 w-3 animate-spin text-zinc-200" />
                        <span>Consultando...</span>
                      </span>
                    ) : webhookSource === "NOT_FOUND" ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-950/40 border border-amber-800/70 text-[11px] font-mono text-amber-300">
                        <AlertTriangle className="h-3 w-3 text-amber-400" />
                        <span>Não encontrado na base</span>
                      </span>
                    ) : webhookSource ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-950/40 border border-emerald-800/70 text-[11px] font-mono text-emerald-300">
                        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                        <span>Sincronizado</span>
                      </span>
                    ) : null}
                  </div>

                  {isSacOrRetencao ? (
                    /* ==============================================================
                       MODO SAC & RETENÇÃO: TICKET (SEM #) + DATAS
                       (O webhook recebe o Ticket + Áudio de uma só vez, puxa os 12 dados e transcreve)
                       ============================================================== */
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-1">
                      <div>
                        <label className="block text-xs font-medium text-zinc-200 mb-1.5">
                          Ticket (sem #) *
                        </label>
                        <div className="relative">
                          <Hash className="h-3.5 w-3.5 text-zinc-500 absolute left-3 top-3" />
                          <input
                            type="text"
                            required
                            value={ticketInput}
                            onChange={(e) =>
                              setTicketInput(
                                e.target.value.replace(/#/g, "").trimStart()
                              )
                            }
                            placeholder="Ex: 14693287"
                            className="w-full h-10 pl-8 pr-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-zinc-200 mb-1.5">
                          Data do Atendimento *
                        </label>
                        <div className="relative">
                          <Calendar className="h-3.5 w-3.5 text-zinc-500 absolute left-3 top-3 pointer-events-none" />
                          <input
                            type="date"
                            required
                            value={dataAtendimentoInput}
                            onChange={(e) =>
                              setDataAtendimentoInput(e.target.value)
                            }
                            className="w-full h-10 pl-8 pr-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-zinc-200 mb-1.5">
                          Data da Monitoria *
                        </label>
                        <div className="relative">
                          <Calendar className="h-3.5 w-3.5 text-zinc-500 absolute left-3 top-3 pointer-events-none" />
                          <input
                            type="date"
                            required
                            value={dataMonitoriaInput}
                            onChange={(e) =>
                              setDataMonitoriaInput(e.target.value)
                            }
                            className="w-full h-10 pl-8 pr-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-500"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* ==============================================================
                       MODO AQUISIÇÃO / DEMAIS SETORES: TELEFONE + 13 CAMPOS DO CLIENTE
                       ============================================================== */
                    <>
                      <div className="space-y-2 pb-3 border-b border-zinc-800/60">
                        <label className="block text-xs font-medium text-zinc-300">
                          Telefone *
                        </label>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <div className="relative flex-1">
                            <Phone className="h-4 w-4 text-zinc-500 absolute left-3.5 top-3" />
                            <input
                              type="text"
                              value={phoneInput}
                              onChange={(e) =>
                                setPhoneInput(formatPhoneMask(e.target.value))
                              }
                              placeholder="Digite o Telefone_Portabilidade ex: (11) 99999-9999"
                              className="w-full h-10 pl-10 pr-4 rounded-lg border border-zinc-800 bg-[#121215] text-sm font-mono text-zinc-100 focus:outline-none focus:border-zinc-500"
                            />
                          </div>
                          <button
                            type="button"
                            disabled={lookupLoading}
                            onClick={() =>
                              pullContactFromWebhook(phoneInput, true)
                            }
                            className="h-10 px-3.5 rounded-lg border border-zinc-800 bg-[#121215] hover:bg-zinc-900 text-xs font-medium text-zinc-200 inline-flex items-center justify-center gap-1.5 shrink-0 transition-colors"
                          >
                            <RefreshCw
                              className={`h-3.5 w-3.5 ${
                                lookupLoading ? "animate-spin" : ""
                              }`}
                            />
                            <span>Puxar Dados</span>
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                        <div>
                          <label className="block text-xs font-medium text-zinc-300 mb-1">
                            Data da Venda
                          </label>
                          <input
                            type="text"
                            value={saleDateInput}
                            onChange={(e) => setSaleDateInput(e.target.value)}
                            placeholder="DD/MM/AAAA"
                            className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-600"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-zinc-300 mb-1">
                            Nome
                          </label>
                          <input
                            type="text"
                            value={customerNameInput}
                            onChange={(e) =>
                              setCustomerNameInput(e.target.value)
                            }
                            placeholder="Nome completo..."
                            className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-zinc-300 mb-1">
                            CPF
                          </label>
                          <input
                            type="text"
                            value={customerCpfInput}
                            onChange={(e) =>
                              setCustomerCpfInput(e.target.value)
                            }
                            placeholder="000.000.000-00"
                            className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-600"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-zinc-300 mb-1">
                            Data de Nascimento
                          </label>
                          <input
                            type="text"
                            value={birthDateInput}
                            onChange={(e) => setBirthDateInput(e.target.value)}
                            placeholder="DD/MM/AAAA"
                            className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-600"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-zinc-300 mb-1">
                            Nome da Mãe
                          </label>
                          <input
                            type="text"
                            value={customerMotherInput}
                            onChange={(e) =>
                              setCustomerMotherInput(e.target.value)
                            }
                            placeholder="Nome da mãe..."
                            className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-zinc-300 mb-1">
                            Plano Contratado
                          </label>
                          <input
                            type="text"
                            value={contractedPlanInput}
                            onChange={(e) =>
                              setContractedPlanInput(e.target.value)
                            }
                            placeholder="Plano contratado..."
                            className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-zinc-300 mb-1">
                            Proposta
                          </label>
                          <input
                            type="text"
                            value={proposalInput}
                            onChange={(e) => setProposalInput(e.target.value)}
                            placeholder="Número da proposta..."
                            className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-600"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-zinc-300 mb-1">
                            E-mail
                          </label>
                          <input
                            type="text"
                            value={emailInput}
                            onChange={(e) => setEmailInput(e.target.value)}
                            placeholder="email@exemplo.com"
                            className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-600"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-zinc-300 mb-1">
                            Forma de Pagamento
                          </label>
                          <input
                            type="text"
                            value={paymentMethodInput}
                            onChange={(e) =>
                              setPaymentMethodInput(e.target.value)
                            }
                            placeholder="Forma de pagamento..."
                            className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-zinc-300 mb-1">
                            Tipo de Fatura
                          </label>
                          <input
                            type="text"
                            value={invoiceTypeInput}
                            onChange={(e) =>
                              setInvoiceTypeInput(e.target.value)
                            }
                            placeholder="Tipo de fatura..."
                            className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-zinc-300 mb-1">
                            Vencimento
                          </label>
                          <input
                            type="text"
                            value={dueDateInput}
                            onChange={(e) => setDueDateInput(e.target.value)}
                            placeholder="Dia de vencimento..."
                            className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-zinc-300 mb-1">
                            Portabilidade Antecipada
                          </label>
                          <input
                            type="text"
                            value={earlyPortabilityInput}
                            onChange={(e) =>
                              setEarlyPortabilityInput(e.target.value)
                            }
                            placeholder="Sim / Não"
                            className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
                          />
                        </div>

                        <div className="sm:col-span-2 lg:col-span-3">
                          <label className="block text-xs font-medium text-zinc-300 mb-1">
                            Endereço Completo
                          </label>
                          <input
                            type="text"
                            value={fullAddressInput}
                            onChange={(e) =>
                              setFullAddressInput(e.target.value)
                            }
                            placeholder="Rua, número, bairro, cidade - UF, CEP..."
                            className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* ==============================================================
                     ANEXO DE GRAVAÇÃO(ÕES) DIRETO NO PASSO 1
                     ============================================================== */}
                  <div className="pt-4 border-t border-zinc-800/80 space-y-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-xs font-bold text-zinc-100">
                          Gravações da Ligação ({recordings.length}) *
                        </h3>
                        <p className="text-[11px] text-zinc-400">
                          {isSacOrRetencao
                            ? "Anexe a ligação; ao avançar, os dados do ticket e a transcrição são puxados automaticamente"
                            : "Anexe uma ou mais ligações vinculadas a este atendimento"}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleAddRecordingSlot}
                        className="h-8 px-3 rounded-lg border border-zinc-700 bg-[#141418] hover:bg-zinc-800 text-xs font-semibold text-zinc-100 inline-flex items-center gap-1.5 transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>+ Adicionar outra ligação</span>
                      </button>
                    </div>

                    <div className="space-y-3">
                      {recordings.map((slot, index) => (
                        <div
                          key={slot.id}
                          className={`p-3.5 rounded-xl border transition-colors space-y-2.5 ${
                            slot.error
                              ? "border-red-700/80 bg-red-950/15"
                              : "border-zinc-800 bg-[#121215]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-mono font-semibold text-zinc-200">
                              Ligação #{index + 1}{" "}
                              {index === 0 ? "(Principal)" : `(Adicional)`} *
                            </span>

                            {recordings.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleRemoveRecordingSlot(slot.id)
                                }
                                className="h-7 px-2.5 rounded-md border border-zinc-800 bg-[#0b0b0d] hover:border-red-900/70 hover:bg-red-950/40 text-[11px] font-medium text-zinc-400 hover:text-red-300 inline-flex items-center gap-1 transition-colors"
                              >
                                <Trash2 className="h-3 w-3" />
                                <span>Remover</span>
                              </button>
                            )}
                          </div>

                          <label
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (
                                e.dataTransfer.files &&
                                e.dataTransfer.files[0]
                              ) {
                                handleRecordingFileSelect(
                                  slot.id,
                                  e.dataTransfer.files[0]
                                );
                              }
                            }}
                            className={`p-3.5 rounded-xl border border-dashed cursor-pointer transition-all flex flex-col sm:flex-row items-center justify-between gap-3 ${
                              slot.file
                                ? "border-zinc-600 bg-[#16161b]"
                                : "border-zinc-800 hover:border-zinc-600 bg-[#0b0b0d]"
                            }`}
                          >
                            <input
                              type="file"
                              accept="audio/*,.mp3,.wav,.ogg,.m4a,.webm"
                              className="hidden"
                              onChange={(e) =>
                                handleRecordingFileSelect(
                                  slot.id,
                                  e.target.files && e.target.files[0]
                                    ? e.target.files[0]
                                    : null
                                )
                              }
                            />

                            <div className="flex items-center gap-3 min-w-0">
                              <div className="h-9 w-9 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                                {slot.file ? (
                                  <FileAudio className="h-4 w-4 text-zinc-100" />
                                ) : (
                                  <UploadCloud className="h-4 w-4 text-zinc-400" />
                                )}
                              </div>

                              {slot.file ? (
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-zinc-100 truncate max-w-[260px] sm:max-w-[360px]">
                                    {slot.file.name}
                                  </p>
                                  <p className="text-[11px] text-zinc-400 font-mono">
                                    {(slot.file.size / 1024).toFixed(1)} KB •{" "}
                                    {formatDuration(slot.durationSeconds)}
                                  </p>
                                </div>
                              ) : (
                                <div>
                                  <p className="text-xs font-medium text-zinc-200">
                                    Clique ou arraste o áudio da Ligação #
                                    {index + 1} (MP3, WAV, OGG)
                                  </p>
                                  <p className="text-[11px] text-zinc-500">
                                    Obrigatório para iniciar a transcrição e
                                    avaliação
                                  </p>
                                </div>
                              )}
                            </div>

                            <span className="h-8 px-3 rounded-lg border border-zinc-700 bg-zinc-900 text-[11px] font-medium text-zinc-200 inline-flex items-center shrink-0">
                              {slot.file
                                ? "Trocar arquivo"
                                : "Selecionar arquivo"}
                            </span>
                          </label>

                          {slot.error && (
                            <p className="text-[11px] text-red-300 font-medium flex items-center gap-1.5">
                              <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                              <span>{slot.error}</span>
                            </p>
                          )}

                          {slot.previewUrl && (
                            <CallAudioPlayer
                              audioUrl={slot.previewUrl}
                              externalCallId={
                                slot.file?.name || `Ligacao_${index + 1}`
                              }
                              durationSeconds={slot.durationSeconds}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-end pt-3 border-t border-zinc-800/80">
                    <button
                      type="submit"
                      disabled={
                        lookupLoading || uploadAttachmentMutation.isPending
                      }
                      className="h-10 px-5 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-zinc-200 text-xs font-semibold inline-flex items-center justify-center gap-2 shrink-0 transition-colors"
                    >
                      <Headphones className="h-3.5 w-3.5" />
                      <span>
                        {lookupLoading || uploadAttachmentMutation.isPending
                          ? "Puxando dados e enviando áudio..."
                          : isSacOrRetencao
                          ? "Puxar Dados, Transcrever e Ir para Avaliação"
                          : `Ir para Avaliação (${recordings.length} áudio${
                              recordings.length > 1 ? "s" : ""
                            })`}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </form>
              </motion.div>
            )}

            {/* ====================================================================
                STEP 2: WORKSTATION MINIMALISTA DE AVALIAÇÃO QA & ÁUDIO (ELEVENLABS STUDIO)
                Viewport-Locked • Zero Caixas Pesadas • Listas Flat com Divisores Sutis
               ==================================================================== */}
            {step === 2 && selectedCall && activeFormForCall && (
              <motion.div
                key="step-2-studio"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex-1 min-h-0 flex flex-col bg-[#0b0b0d] overflow-hidden"
              >
                {/* Elemento de Áudio HTML5 Sincronizado */}
                <audio
                  ref={studioAudioRef}
                  src={activeStudioAudioUrl}
                  preload="metadata"
                  onLoadedMetadata={(e) => {
                    const el = e.currentTarget;
                    if (el.duration && isFinite(el.duration) && el.duration > 0) {
                      const realSecs = Math.round(el.duration);
                      setStudioDuration(realSecs);
                      if (
                        selectedCall.externalCallId &&
                        Math.abs(realSecs - (selectedCall.durationSeconds || 0)) >
                          2
                      ) {
                        callsApi
                          .syncDetectedDuration(
                            selectedCall.externalCallId,
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

                {/* CORPO SPLIT-PANE (ESQUERDA: DIÁLOGO EDITORIAL | DIREITA: ABAS FLAT) */}
                <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
                  {/* ================================================================
                      COLUNA ESQUERDA (6 COLUNAS): TRANSCRIÇÃO EDITORIAL (ESTILO ELEVENLABS)
                     ================================================================ */}
                  <div className="lg:col-span-6 h-full min-h-0 flex flex-col border-b lg:border-b-0 lg:border-r border-zinc-800/70 bg-[#0b0b0d]">
                    {/* Barra Única Limpa da Transcrição (Apenas Busca + Botão Sincronizar) */}
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
                          aria-label="Filtrar transcrição"
                          value={transcriptSearch}
                          onChange={(e) => setTranscriptSearch(e.target.value)}
                          placeholder="Buscar na conversa…"
                          className="w-full h-7 pl-7 pr-2.5 rounded-md border border-zinc-800/80 bg-zinc-900/50 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600 transition-colors"
                        />
                      </div>

                      <button
                        type="button"
                        aria-label="Sincronizar transcrição do webhook"
                        onClick={async () => {
                          if (!selectedCall?.id) return;
                          setAiWebhookError(null);
                          try {
                            const latest = await callsApi.getById(
                              selectedCall.id
                            );
                            const meta = latest.metadata || {};
                            if (
                              typeof meta.transcricao === "string" &&
                              meta.transcricao.trim().length > 200
                            ) {
                              const payloadWithTranscricao =
                                typeof meta.aiEvaluationData === "object" &&
                                meta.aiEvaluationData !== null
                                  ? {
                                      ...(meta.aiEvaluationData as Record<
                                        string,
                                        unknown
                                      >),
                                      transcricao: meta.transcricao,
                                    }
                                  : { transcricao: meta.transcricao };
                              applyAiEvaluationPayload(
                                payloadWithTranscricao,
                                activeFormForCall
                              );
                              return;
                            }
                          } catch {
                            // Prossegue para reenvio
                          }
                          setAiSyncStatus("PROCESSING");
                          await callsApi
                            .retryAudioWebhook(selectedCall.id)
                            .catch(() => {});
                        }}
                        className="h-7 px-2.5 rounded-md border border-zinc-800/80 bg-zinc-900/50 hover:bg-zinc-800 text-xs font-mono text-zinc-300 inline-flex items-center gap-1.5 transition-colors shrink-0"
                      >
                        <RefreshCw
                          className={`h-3 w-3 ${
                            aiSyncStatus === "PROCESSING" ? "animate-spin" : ""
                          }`}
                          aria-hidden="true"
                        />
                        <span>Sincronizar</span>
                      </button>
                    </div>

                    {aiWebhookError && (
                      <div
                        role="alert"
                        className="mx-5 mt-3 p-2.5 rounded-lg border border-amber-800/60 bg-amber-950/30 text-xs text-amber-200 flex items-start gap-2 shrink-0"
                      >
                        <AlertTriangle
                          className="h-4 w-4 text-amber-400 shrink-0 mt-0.5"
                          aria-hidden="true"
                        />
                        <span>{aiWebhookError}</span>
                      </div>
                    )}

                    {/* Corpo Rolável da Conversa (Auto-Scroll sincronizado com o áudio) */}
                    <div
                      ref={transcriptContainerRef}
                      className="flex-1 min-h-0 overflow-y-auto px-6 py-5 relative"
                    >
                      {studioTranscriptMode === "raw" ? (
                        <textarea
                          name="rawTranscript"
                          aria-label="Texto bruto da transcrição"
                          value={transcricaoInput}
                          onChange={(e) => setTranscricaoInput(e.target.value)}
                          placeholder="Cole ou edite a transcrição aqui (ex: [00:02] Atendente: Alô, boa tarde…)…"
                          className="w-full h-full min-h-[360px] p-4 rounded-lg border border-zinc-800/80 bg-zinc-900/30 text-xs font-mono leading-relaxed text-zinc-200 focus:outline-none focus:border-zinc-600 resize-none"
                        />
                      ) : filteredTranscriptTurns.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center py-16 px-4 space-y-2.5">
                          {aiSyncStatus === "PROCESSING" ? (
                            <>
                              <Loader2
                                className="h-5 w-5 animate-spin text-zinc-500"
                                aria-hidden="true"
                              />
                              <p className="text-xs font-medium text-zinc-300">
                                Transcrevendo gravação e avaliando critérios…
                              </p>
                              <p className="text-xs text-zinc-500 max-w-xs leading-relaxed">
                                Ouça o áudio abaixo ou confira os critérios ao
                                lado enquanto a análise finaliza.
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="text-xs text-zinc-400">
                                {transcriptSearch
                                  ? "Nenhum trecho encontrado para esta busca."
                                  : "Nenhuma transcrição disponível."}
                              </p>
                              <button
                                type="button"
                                onClick={() => setStudioTranscriptMode("raw")}
                                className="px-3 py-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-xs text-zinc-300 transition-colors"
                              >
                                Inserir transcrição manualmente
                              </button>
                            </>
                          )}
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
                                {/* Avatar Minimalista */}
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
                                    <span className="text-xs font-medium text-zinc-300">
                                      {turn.speakerLabel}
                                    </span>
                                    {turn.tone && (
                                      <span className="text-[11px] font-mono text-zinc-500 truncate">
                                        · {turn.tone}
                                      </span>
                                    )}
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      seekStudioAudioTo(turn.startSeconds, true)
                                    }
                                    className={`w-full text-left rounded-lg transition-colors ${
                                      isAgent
                                        ? isCurrentTurn
                                          ? "bg-zinc-800/80 border border-zinc-600 px-3.5 py-2.5"
                                          : "bg-zinc-900/45 border border-zinc-800/60 hover:border-zinc-700/80 px-3.5 py-2.5"
                                        : isCurrentTurn
                                        ? "bg-zinc-900/70 px-3 py-1.5 rounded-lg"
                                        : "hover:bg-zinc-900/30 px-1 py-0.5"
                                    }`}
                                  >
                                    <p className="text-[13px] leading-[1.6] text-zinc-200">
                                      {turn.text}
                                    </p>
                                  </button>

                                  {/* Linha de Metadados Inferior (Idêntico ao ElevenLabs: "0:05 | + Marcar") */}
                                  <div className="flex items-center gap-2.5 pt-0.5 text-[11px] font-mono text-zinc-500">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        seekStudioAudioTo(
                                          turn.startSeconds,
                                          true
                                        )
                                      }
                                      className={`tabular-nums hover:text-zinc-200 transition-colors ${
                                        isCurrentTurn
                                          ? "text-zinc-100 font-semibold"
                                          : ""
                                      }`}
                                    >
                                      {turn.timestampLabel}
                                    </button>

                                    <span
                                      className="text-zinc-800"
                                      aria-hidden="true"
                                    >
                                      |
                                    </span>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        const snippet = `• [${turn.timestampLabel}] ${turn.speakerLabel}: “${turn.text.slice(
                                          0,
                                          90
                                        )}”`;
                                        setGeneralFeedback((prev) =>
                                          prev ? `${prev}\n${snippet}` : snippet
                                        );
                                        setStudioRightTab("observations");
                                      }}
                                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-zinc-400 hover:text-zinc-100 transition-opacity"
                                    >
                                      + Marcar em observações
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
                      COLUNA DIREITA (6 COLUNAS): ABAS FLAT COM UNDERLINE (ESTILO ELEVENLABS)
                     ================================================================ */}
                  <div className="lg:col-span-6 h-full min-h-0 flex flex-col bg-[#0b0b0d]">
                    {/* Abas com Underline Limpo (Sem Caixas Pesadas) */}
                    <div className="h-10 px-6 border-b border-zinc-800/70 flex items-center justify-between gap-4 shrink-0">
                      <div
                        role="tablist"
                        aria-label="Seções da avaliação"
                        className="flex items-center gap-6 h-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                      >
                        <button
                          type="button"
                          role="tab"
                          aria-selected={studioRightTab === "criteria"}
                          onClick={() => setStudioRightTab("criteria")}
                          className={`h-full border-b-2 text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                            studioRightTab === "criteria"
                              ? "border-zinc-100 text-zinc-100"
                              : "border-transparent text-zinc-500 hover:text-zinc-300"
                          }`}
                        >
                          <span>Critérios</span>
                          <span className="text-[11px] font-mono text-zinc-400 tabular-nums">
                            {
                              standardItems.filter((i) => checkedMap[i.id])
                                .length
                            }
                            /{standardItems.length}
                          </span>
                        </button>

                        <button
                          type="button"
                          role="tab"
                          aria-selected={studioRightTab === "observations"}
                          onClick={() => setStudioRightTab("observations")}
                          className={`h-full border-b-2 text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                            studioRightTab === "observations"
                              ? "border-zinc-100 text-zinc-100"
                              : "border-transparent text-zinc-500 hover:text-zinc-300"
                          }`}
                        >
                          <span>Observações & Falta Grave</span>
                          {liveScore.fatalTriggered && (
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-red-500"
                              aria-hidden="true"
                            />
                          )}
                        </button>

                        <button
                          type="button"
                          role="tab"
                          aria-selected={studioRightTab === "customer"}
                          onClick={() => setStudioRightTab("customer")}
                          className={`h-full border-b-2 text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                            studioRightTab === "customer"
                              ? "border-zinc-100 text-zinc-100"
                              : "border-transparent text-zinc-500 hover:text-zinc-300"
                          }`}
                        >
                          <span>Dados do Cliente</span>
                        </button>
                      </div>

                      <span className="hidden sm:inline text-[11px] font-mono text-zinc-500 shrink-0 tabular-nums">
                        Meta:{" "}
                        {Number(
                          activeFormForCall.passingScorePercentage
                        ).toFixed(0)}
                        %
                      </span>
                    </div>

                    {/* CONTEÚDO ROLÁVEL DA ABA ATIVA */}
                    <div className="flex-1 min-h-0 overflow-y-auto">
                      {/* ABA 1: CRITÉRIOS EM LISTA FLAT (DIVIDE-Y • ALTA DENSIDADE E CLAREZA) */}
                      {studioRightTab === "criteria" && (
                        <div>
                          {/* Sub-barra de Filtro Enxuta */}
                          <div className="sticky top-0 z-10 px-6 py-2.5 border-b border-zinc-800/60 bg-[#0b0b0d]/95 backdrop-blur flex items-center justify-between gap-2">
                            <div className="flex items-center gap-3 text-xs">
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
                              <span
                                className="text-zinc-800"
                                aria-hidden="true"
                              >
                                ·
                              </span>
                              <button
                                type="button"
                                onClick={() => setCriteriaFilter("UNCHECKED")}
                                className={`font-medium transition-colors ${
                                  criteriaFilter === "UNCHECKED"
                                    ? "text-zinc-100"
                                    : "text-zinc-500 hover:text-zinc-300"
                                }`}
                              >
                                Desmarcados (
                                {
                                  standardItems.filter((i) => !checkedMap[i.id])
                                    .length
                                }
                                )
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                const allChecked = standardItems.every(
                                  (i) => checkedMap[i.id]
                                );
                                const next = { ...checkedMap };
                                standardItems.forEach((i) => {
                                  next[i.id] = !allChecked;
                                });
                                setCheckedMap(next);
                              }}
                              className="text-[11px] font-mono text-zinc-500 hover:text-zinc-200 transition-colors"
                            >
                              Alternar todos
                            </button>
                          </div>

                          {/* Linha de Falta Grave (Compacta e Flat) */}
                          {fatalItems.map((item) => {
                            const isViolated = !!checkedMap[item.id];
                            return (
                              <div
                                key={item.id}
                                className={`px-6 py-3 border-b transition-colors ${
                                  isViolated
                                    ? "border-red-900/50 bg-red-950/20"
                                    : "border-zinc-800/60 bg-zinc-900/20"
                                }`}
                              >
                                <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <input
                                      type="checkbox"
                                      checked={isViolated}
                                      onChange={(e) => {
                                        const checked = e.target.checked;
                                        setCheckedMap((prev) => ({
                                          ...prev,
                                          [item.id]: checked,
                                        }));
                                        if (
                                          checked &&
                                          motivoFaltaGrave === "N/A"
                                        ) {
                                          setMotivoFaltaGrave("");
                                        } else if (!checked) {
                                          setMotivoFaltaGrave("N/A");
                                        }
                                      }}
                                      className="h-4 w-4 rounded border-zinc-600 text-red-600 focus:ring-0 cursor-pointer shrink-0"
                                    />
                                    <span className="text-xs font-medium text-zinc-200 truncate">
                                      {item.label}
                                    </span>
                                  </div>
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider shrink-0 ${
                                      isViolated
                                        ? "bg-red-950 text-red-300 border border-red-800/80"
                                        : "bg-zinc-900 text-zinc-500"
                                    }`}
                                  >
                                    {isViolated
                                      ? "Falta Grave Ativa"
                                      : "Falta Grave"}
                                  </span>
                                </label>
                              </div>
                            );
                          })}

                          {/* Lista Flat de Critérios (Sem Caixas Individuais • Separados por Linha Sutil) */}
                          <div className="divide-y divide-zinc-800/50">
                            {standardItems
                              .filter((item) =>
                                criteriaFilter === "UNCHECKED"
                                  ? !checkedMap[item.id]
                                  : true
                              )
                              .map((item) => {
                                const isChecked = !!checkedMap[item.id];
                                const noteOpen = expandedNoteItemId === item.id;

                                return (
                                  <div
                                    key={item.id}
                                    className="px-6 py-3 hover:bg-zinc-900/30 transition-colors"
                                  >
                                    <div className="flex items-start justify-between gap-4">
                                      <label className="flex items-start gap-3 cursor-pointer flex-1 select-none min-w-0">
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={(e) =>
                                            setCheckedMap((prev) => ({
                                              ...prev,
                                              [item.id]: e.target.checked,
                                            }))
                                          }
                                          className="mt-0.5 h-4 w-4 rounded border-zinc-700 text-zinc-100 focus:ring-0 cursor-pointer shrink-0"
                                        />
                                        <div className="min-w-0">
                                          <p
                                            className={`text-[13px] leading-snug ${
                                              isChecked
                                                ? "text-zinc-200"
                                                : "text-amber-200/90"
                                            }`}
                                          >
                                            {item.label}
                                          </p>
                                          <span className="text-[11px] font-mono text-zinc-500 block mt-0.5">
                                            {item.category}
                                          </span>
                                        </div>
                                      </label>

                                      <div className="flex items-center gap-2 shrink-0 pt-0.5">
                                        <span
                                          className={`text-[11px] font-mono tabular-nums ${
                                            isChecked
                                              ? "text-zinc-300"
                                              : "text-red-400"
                                          }`}
                                        >
                                          {isChecked
                                            ? `${item.points || 1} pts`
                                            : `0/${item.points || 1}`}
                                        </span>

                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (
                                              !noteOpen &&
                                              !observationMap[item.id]
                                            ) {
                                              const stamp = `[${formatMmSs(
                                                studioCurrentTime
                                              )}] `;
                                              setObservationMap((prev) => ({
                                                ...prev,
                                                [item.id]: stamp,
                                              }));
                                            }
                                            setExpandedNoteItemId(
                                              noteOpen ? null : item.id
                                            );
                                          }}
                                          className="text-[11px] font-mono text-zinc-500 hover:text-zinc-200 transition-colors"
                                        >
                                          Obs
                                        </button>
                                      </div>
                                    </div>

                                    {(noteOpen || observationMap[item.id]) && (
                                      <div className="pl-7 pt-2">
                                        <input
                                          type="text"
                                          aria-label={`Observação para ${item.label}`}
                                          value={observationMap[item.id] || ""}
                                          onChange={(e) =>
                                            setObservationMap((prev) => ({
                                              ...prev,
                                              [item.id]: e.target.value,
                                            }))
                                          }
                                          placeholder="Observação deste critério com [MM:SS]…"
                                          className="w-full h-8 px-3 rounded-md border border-zinc-800 bg-zinc-900/50 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-600"
                                        />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}

                      {/* ABA 2: OBSERVAÇÕES & FALTA GRAVE (LAYOUT EDITORIAL LIMPO) */}
                      {studioRightTab === "observations" && (
                        <div className="p-6 space-y-6">
                          {fatalItems.length > 0 && (
                            <div className="space-y-2 pb-5 border-b border-zinc-800/60">
                              <div className="flex items-center justify-between">
                                <label
                                  htmlFor="motivo-falta-grave"
                                  className="text-xs font-medium text-zinc-200"
                                >
                                  Motivo da Falta Grave
                                </label>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider ${
                                    liveScore.fatalTriggered
                                      ? "bg-red-950/60 text-red-300 border border-red-900/60"
                                      : "bg-zinc-900 text-zinc-500"
                                  }`}
                                >
                                  {liveScore.fatalTriggered
                                    ? "Falta Grave Ativa (Nota 0)"
                                    : "Sem Falta Grave"}
                                </span>
                              </div>
                              <textarea
                                id="motivo-falta-grave"
                                rows={3}
                                value={motivoFaltaGrave}
                                onChange={(e) =>
                                  setMotivoFaltaGrave(e.target.value)
                                }
                                placeholder="Descreva o motivo com o minuto e segundo [MM:SS] caso haja falta grave…"
                                className="w-full p-3 rounded-lg border border-zinc-800/80 bg-zinc-900/35 text-xs font-mono leading-relaxed text-zinc-100 focus:outline-none focus:border-zinc-600 resize-y"
                              />
                            </div>
                          )}

                          <div className="space-y-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <label
                                htmlFor="observacoes-monitoria"
                                className="text-xs font-medium text-zinc-200"
                              >
                                Observações & Minutagem do Atendimento
                              </label>
                              <div className="flex flex-wrap items-center gap-1.5">
                                {[
                                  "Vício de linguagem (né / tá / aí).",
                                  "Não mencionou canais digitais.",
                                  "Não confirmou CPF/e-mail.",
                                ].map((snippet) => (
                                  <button
                                    key={snippet}
                                    type="button"
                                    onClick={() => {
                                      const stamp = formatMmSs(
                                        studioCurrentTime
                                      );
                                      const lineWithTime = `[${stamp}] ${snippet}`;
                                      setGeneralFeedback((prev) =>
                                        prev
                                          ? `${prev}\n• ${lineWithTime}`
                                          : `• ${lineWithTime}`
                                      );
                                    }}
                                    className="px-2 py-0.5 rounded-md border border-zinc-800/80 bg-zinc-900/50 hover:bg-zinc-800 text-[10px] font-mono text-zinc-400 hover:text-zinc-200 transition-colors"
                                  >
                                    + [{formatMmSs(studioCurrentTime)}]{" "}
                                    {snippet.slice(0, 18)}…
                                  </button>
                                ))}
                              </div>
                            </div>

                            <textarea
                              id="observacoes-monitoria"
                              rows={8}
                              value={generalFeedback}
                              onChange={(e) =>
                                setGeneralFeedback(e.target.value)
                              }
                              placeholder="Resumo do atendimento e observações com minuto e segundo [MM:SS]…"
                              className="w-full p-3.5 rounded-lg border border-zinc-800/80 bg-zinc-900/35 text-xs font-mono leading-relaxed text-zinc-100 focus:outline-none focus:border-zinc-600 resize-y"
                            />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-zinc-800/60">
                            <div>
                              <label
                                htmlFor="pontos-fortes"
                                className="block text-xs text-zinc-400 mb-1.5"
                              >
                                Pontos Fortes (Opcional)
                              </label>
                              <textarea
                                id="pontos-fortes"
                                rows={2}
                                value={pontosFortes}
                                onChange={(e) =>
                                  setPontosFortes(e.target.value)
                                }
                                placeholder="Pontos fortes identificados…"
                                className="w-full p-2.5 rounded-lg border border-zinc-800/80 bg-zinc-900/35 text-xs text-zinc-100 focus:outline-none focus:border-zinc-600 resize-y"
                              />
                            </div>
                            <div>
                              <label
                                htmlFor="oportunidades-melhoria"
                                className="block text-xs text-zinc-400 mb-1.5"
                              >
                                Oportunidades de Melhoria (Opcional)
                              </label>
                              <textarea
                                id="oportunidades-melhoria"
                                rows={2}
                                value={melhorias}
                                onChange={(e) => setMelhorias(e.target.value)}
                                placeholder="Oportunidades de melhoria…"
                                className="w-full p-2.5 rounded-lg border border-zinc-800/80 bg-zinc-900/35 text-xs text-zinc-100 focus:outline-none focus:border-zinc-600 resize-y"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* ABA 3: DADOS DO CLIENTE (VARIÁVEIS DINÂMICAS ESTILO ELEVENLABS) */}
                      {studioRightTab === "customer" && (
                        <div className="p-6 space-y-4">
                          <h3 className="text-xs font-medium text-zinc-300">
                            Variáveis dinâmicas
                          </h3>

                          <div className="divide-y divide-zinc-800/60 border-t border-b border-zinc-800/60">
                            {(isSacOrRetencao
                              ? [
                                  {
                                    key: "ticket_id",
                                    val:
                                      ticketInput.replace(/#/g, "").trim() ||
                                      "-",
                                  },
                                  {
                                    key: "protocolo",
                                    val: protocoloInput || "-",
                                  },
                                  {
                                    key: "nome_completo",
                                    val: customerNameInput || "-",
                                  },
                                  {
                                    key: "cpf",
                                    val: customerCpfInput || "-",
                                  },
                                  {
                                    key: "telefone_origem",
                                    val: telefoneOrigemInput || "-",
                                  },
                                  {
                                    key: "administradora",
                                    val: administradoraInput || "-",
                                  },
                                  {
                                    key: "operadora",
                                    val: operadoraInput || "-",
                                  },
                                  {
                                    key: "situacao",
                                    val: situacaoInput || "-",
                                  },
                                  {
                                    key: "canal_de_entrada",
                                    val: canalEntradaInput || "-",
                                  },
                                  {
                                    key: "motivo_contato",
                                    val: motivoContatoInput || "-",
                                  },
                                  {
                                    key: "submotivo_plano",
                                    val: submotivoPlanoInput || "-",
                                  },
                                  {
                                    key: "nome_atendente",
                                    val: nomeAtendenteInput || "-",
                                  },
                                  {
                                    key: "data_atendimento",
                                    val: dataAtendimentoInput || "-",
                                  },
                                  {
                                    key: "data_monitoria",
                                    val: dataMonitoriaInput || "-",
                                  },
                                ]
                              : [
                                  {
                                    key: "telefone_portabilidade",
                                    val:
                                      extractCleanPhoneDigits(phoneInput) ||
                                      selectedCall.customerIdentifier ||
                                      "-",
                                  },
                                  {
                                    key: "nome",
                                    val: customerNameInput || "-",
                                  },
                                  {
                                    key: "cpf",
                                    val: customerCpfInput || "-",
                                  },
                                  {
                                    key: "proposta",
                                    val: proposalInput || "-",
                                  },
                                  {
                                    key: "data_da_venda",
                                    val: saleDateInput || "-",
                                  },
                                  {
                                    key: "data_de_nascimento",
                                    val: birthDateInput || "-",
                                  },
                                  {
                                    key: "nome_da_mae",
                                    val: customerMotherInput || "-",
                                  },
                                  {
                                    key: "plano_contratado",
                                    val: contractedPlanInput || "-",
                                  },
                                  {
                                    key: "email",
                                    val: emailInput || "-",
                                  },
                                  {
                                    key: "forma_de_pagamento",
                                    val: paymentMethodInput || "-",
                                  },
                                  {
                                    key: "tipo_de_fatura",
                                    val: invoiceTypeInput || "-",
                                  },
                                  {
                                    key: "vencimento",
                                    val: dueDateInput || "-",
                                  },
                                  {
                                    key: "portabilidade_antecipada",
                                    val: earlyPortabilityInput || "-",
                                  },
                                  {
                                    key: "endereco_completo",
                                    val: fullAddressInput || "-",
                                  },
                                ]
                            ).map((row) => (
                              <div
                                key={row.key}
                                className="py-2.5 flex items-start justify-between gap-4 text-xs"
                              >
                                <span
                                  className="font-mono text-zinc-400 shrink-0"
                                  translate="no"
                                >
                                  <span className="text-zinc-600 mr-1.5">
                                    {"{}"}
                                  </span>
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
                                      setTimeout(
                                        () => setCopiedVarKey(null),
                                        1500
                                      );
                                    }}
                                    className="text-zinc-500 hover:text-zinc-200 shrink-0"
                                  >
                                    {copiedVarKey === row.key ? (
                                      <Check
                                        className="h-3 w-3 text-emerald-400"
                                        aria-hidden="true"
                                      />
                                    ) : (
                                      <Copy
                                        className="h-3 w-3"
                                        aria-hidden="true"
                                      />
                                    )}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Rodapé Enxuto do Painel Direito: Nota Final + Voltar + Publicar Monitoria */}
                    <div className="h-12 px-6 border-t border-zinc-800/70 bg-[#0b0b0d] flex items-center justify-between gap-3 shrink-0">
                      <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
                        <span className="text-zinc-500">Nota:</span>
                        <span
                          className={`font-semibold ${
                            liveScore.fatalTriggered
                              ? "text-red-400"
                              : liveScore.status === "APROVADO"
                              ? "text-emerald-400"
                              : "text-zinc-100"
                          }`}
                        >
                          {liveScore.finalPercentage.toFixed(0)}% (
                          {liveScore.obtainedPoints}/
                          {liveScore.maxPossiblePoints} pts)
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setStep(1)}
                          className="h-8 px-3 rounded-md border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-xs text-zinc-300 transition-colors"
                        >
                          Voltar
                        </button>
                        <button
                          type="button"
                          disabled={submitEvaluationMutation.isPending}
                          onClick={() => submitEvaluationMutation.mutate()}
                          className="h-8 px-3.5 rounded-md bg-zinc-100 text-zinc-950 hover:bg-zinc-200 font-semibold text-xs inline-flex items-center gap-1.5 transition-colors"
                        >
                          <FileCheck2
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                          <span>
                            {submitEvaluationMutation.isPending
                              ? "Salvando…"
                              : "Publicar Monitoria"}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ==================================================================
                    BARRA INFERIOR DE ÁUDIO & WAVEFORM ACÚSTICA (IDÊNTICA AO ELEVENLABS)
                   ================================================================== */}
                <div className="px-6 py-2.5 border-t border-zinc-800/70 bg-[#09090b] shrink-0 space-y-2">
                  {/* Linha 1: Controles Centrais Limpos sem Poluição Visual */}
                  <div className="flex items-center justify-between gap-4">
                    {/* Esquerda: Seletor de Áudio + Botão Marcar Minutagem */}
                    <div className="flex items-center gap-2 min-w-0 w-1/3">
                      {recordings.length > 1 ? (
                        <div className="inline-flex items-center gap-1">
                          {recordings.map((slot, idx) => (
                            <button
                              key={slot.id}
                              type="button"
                              onClick={() => setActiveRecordingIdx(idx)}
                              className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                                activeRecordingIdx === idx
                                  ? "bg-zinc-100 text-zinc-950 font-semibold"
                                  : "text-zinc-400 hover:text-zinc-200"
                              }`}
                            >
                              Áudio #{idx + 1}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] font-mono text-zinc-500 truncate max-w-[200px]">
                          {activeStudioRecording?.file?.name ||
                            selectedCall.externalCallId}
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          const stamp = formatMmSs(studioCurrentTime);
                          setGeneralFeedback((prev) =>
                            prev
                              ? `${prev}\n• [${stamp}] `
                              : `• [${stamp}] `
                          );
                          setStudioRightTab("observations");
                        }}
                        className="px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-[11px] font-mono text-zinc-400 hover:text-zinc-200 transition-colors shrink-0 tabular-nums"
                      >
                        + [{formatMmSs(studioCurrentTime)}]
                      </button>
                    </div>

                    {/* Centro: Velocidade + ↺ + Play/Pause + ↻ + 0:00 / 15:04 (Idêntico ao ElevenLabs) */}
                    <div className="flex items-center justify-center gap-3 w-1/3">
                      <button
                        type="button"
                        aria-label="Alternar velocidade de reprodução"
                        onClick={() => {
                          const rates = [1, 1.25, 1.5, 2, 0.75];
                          const next =
                            rates[
                              (rates.indexOf(studioSpeed) + 1) % rates.length
                            ];
                          setStudioSpeed(next);
                          if (studioAudioRef.current) {
                            studioAudioRef.current.playbackRate = next;
                          }
                        }}
                        className="px-2 py-0.5 rounded text-xs font-mono text-zinc-400 hover:text-zinc-100 transition-colors tabular-nums"
                      >
                        {studioSpeed}x
                      </button>

                      <button
                        type="button"
                        aria-label="Retroceder 5 segundos"
                        onClick={() => skipStudioSeconds(-5)}
                        className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 transition-colors"
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>

                      <button
                        type="button"
                        aria-label={
                          studioPlaying ? "Pausar áudio" : "Reproduzir áudio"
                        }
                        onClick={toggleStudioPlay}
                        className="h-8 w-8 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-950 flex items-center justify-center transition-transform active:scale-95"
                      >
                        {studioPlaying ? (
                          <Pause
                            className="h-3.5 w-3.5 fill-current"
                            aria-hidden="true"
                          />
                        ) : (
                          <Play
                            className="h-3.5 w-3.5 ml-0.5 fill-current"
                            aria-hidden="true"
                          />
                        )}
                      </button>

                      <button
                        type="button"
                        aria-label="Avançar 5 segundos"
                        onClick={() => skipStudioSeconds(5)}
                        className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 transition-colors"
                      >
                        <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>

                      <span className="text-xs font-mono text-zinc-400 tabular-nums whitespace-nowrap">
                        {formatMmSs(studioCurrentTime)} /{" "}
                        {formatMmSs(studioDuration)}
                      </span>
                    </div>

                    {/* Direita: Volume Minimalista */}
                    <div className="flex items-center justify-end gap-2 w-1/3">
                      <button
                        type="button"
                        aria-label={
                          studioMuted ? "Ativar som" : "Silenciar áudio"
                        }
                        onClick={() => {
                          const nextMuted = !studioMuted;
                          setStudioMuted(nextMuted);
                          if (studioAudioRef.current) {
                            studioAudioRef.current.muted = nextMuted;
                          }
                        }}
                        className="text-zinc-400 hover:text-zinc-100"
                      >
                        {studioMuted ? (
                          <VolumeX
                            className="h-3.5 w-3.5 text-red-400"
                            aria-hidden="true"
                          />
                        ) : (
                          <Volume2
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
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
                        className="w-16 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-zinc-200 hidden sm:block"
                      />
                    </div>
                  </div>

                  {/* Linha 2: Waveform Acústica Limpa (Sem Caixa Pesada • Idêntico ao ElevenLabs) */}
                  <div
                    role="slider"
                    aria-label="Linha do tempo do áudio"
                    aria-valuemin={0}
                    aria-valuemax={studioDuration || 180}
                    aria-valuenow={Math.round(studioCurrentTime)}
                    tabIndex={0}
                    className="relative h-6 w-full flex items-center gap-[3px] cursor-pointer select-none"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const ratio = Math.max(
                        0,
                        Math.min(1, (e.clientX - rect.left) / rect.width)
                      );
                      seekStudioAudioTo(ratio * (studioDuration || 180), true);
                    }}
                  >
                    {WAVEFORM_BARS_HEIGHTS.map((barHeight, idx) => {
                      const progressRatio =
                        studioDuration > 0
                          ? studioCurrentTime / studioDuration
                          : 0;
                      const barRatio = idx / WAVEFORM_BARS_HEIGHTS.length;
                      const isPlayed = barRatio <= progressRatio;
                      return (
                        <div
                          key={idx}
                          style={{ height: `${Math.max(16, barHeight * 0.6)}%` }}
                          className={`flex-1 rounded-full transition-colors duration-75 ${
                            isPlayed ? "bg-zinc-200" : "bg-zinc-800"
                          }`}
                        />
                      );
                    })}

                    {/* Marcadores de Minutagem de Falhas */}
                    {extractWaveformMarkers(
                      motivoFaltaGrave,
                      generalFeedback,
                      liveScore.fatalTriggered
                    ).map((marker) => {
                      const pct =
                        studioDuration > 0
                          ? Math.min(
                              98,
                              Math.max(
                                1,
                                (marker.seconds / studioDuration) * 100
                              )
                            )
                          : 0;
                      if (pct <= 0) return null;
                      return (
                        <button
                          key={`${marker.label}-${marker.seconds}`}
                          type="button"
                          aria-label={`Ir para ${marker.label}: ${marker.description}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            seekStudioAudioTo(marker.seconds, true);
                          }}
                          style={{ left: `${pct}%` }}
                          title={`[${marker.label}] ${marker.description}`}
                          className={`absolute top-0 bottom-0 w-0.5 z-10 ${
                            marker.isFatal ? "bg-red-500" : "bg-amber-400"
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </AppShell>
  );
}

export default function AnalystEvaluationFlowPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <div className="p-8 text-xs font-mono text-zinc-400">
            Carregando fluxo de avaliação...
          </div>
        </AppShell>
      }
    >
      <AnalystEvaluationFlowInner />
    </Suspense>
  );
}
