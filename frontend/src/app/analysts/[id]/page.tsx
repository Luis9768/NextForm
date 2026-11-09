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
  FileAudio,
  FileCheck2,
  FolderKanban,
  Hash,
  Headphones,
  Loader2,
  Phone,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  UploadCloud,
  User,
  UserCheck,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { CallAudioPlayer } from "@/components/audio/CallAudioPlayer";
import { useAuth } from "@/context/AuthContext";
import {
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

type FlowStep = 1 | 2 | 3;

const AVAILABLE_SECTORS = ["SAC", "Cobrança & Retenção", "Aquisição"] as const;

const DIRECTUS_WEBHOOK_URL =
  process.env.NEXT_PUBLIC_CUSTOMER_WEBHOOK_URL || "";

const AUDIO_EVALUATION_WEBHOOK_URL =
  process.env.NEXT_PUBLIC_AUDIO_EVALUATION_WEBHOOK_URL ||
  "https://projetos.n8n.hdstec.com.br/webhook/76f4953c-1049-4528-8923-1a1fb69890f7";

function unwrapWebhookDataObject(
  raw: unknown
): Record<string, unknown> | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    return raw.length > 0 ? unwrapWebhookDataObject(raw[0]) : null;
  }
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (obj.data && typeof obj.data === "object") {
      return unwrapWebhookDataObject(obj.data);
    }
    if (obj.output && typeof obj.output === "object") {
      return unwrapWebhookDataObject(obj.output);
    }
    if (obj.result && typeof obj.result === "object") {
      return unwrapWebhookDataObject(obj.result);
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

  // Campos Condicionais SAC / Retenção (Regra de Negócio: Ticket Zendesk + Data do Atendimento + Data da Monitoria)
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [ticketInput, setTicketInput] = useState("");
  const [dataAtendimentoInput, setDataAtendimentoInput] = useState(todayIso);
  const [dataMonitoriaInput, setDataMonitoriaInput] = useState(todayIso);

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
        "";
      if (rawTranscricao.trim()) {
        setTranscricaoInput(
          rawTranscricao
            .replace(/^```\n?/, "")
            .replace(/\n?```$/, "")
            .trim()
        );
        appliedAny = true;
      } else {
        const minGraves =
          typeof dataMap.minutagem_faltas_graves === "string" &&
          dataMap.minutagem_faltas_graves !== "N/A"
            ? dataMap.minutagem_faltas_graves.trim()
            : "";
        const minComuns =
          typeof dataMap.minutagem_falhas_comuns === "string" &&
          dataMap.minutagem_falhas_comuns !== "N/A"
            ? dataMap.minutagem_falhas_comuns.trim()
            : "";
        const combinedMinutagem = [minGraves, minComuns]
          .filter(Boolean)
          .join("\n");
        if (combinedMinutagem) {
          setTranscricaoInput(combinedMinutagem);
          appliedAny = true;
        }
      }

      const rawObs =
        (typeof dataMap.Observacoes === "string" && dataMap.Observacoes) ||
        (typeof dataMap.Breve_resumo_do_atendimento === "string" &&
          dataMap.Breve_resumo_do_atendimento) ||
        "";
      if (rawObs.trim()) {
        setGeneralFeedback(rawObs.trim());
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
        setMotivoFaltaGrave(dataMap.Motivo_falta_grave.trim());
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

  // Polling automático na Etapa 3 enquanto aguarda retorno da transcrição e respostas (true/false) do webhook n8n
  useEffect(() => {
    if (
      step !== 3 ||
      !selectedCall?.id ||
      aiSyncStatus === "COMPLETED" ||
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
          applyAiEvaluationPayload(meta.aiEvaluationData, activeFormForCall);
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
    activeFormForCall,
    applyAiEvaluationPayload,
  ]);
  const isSacOrRetencao = useMemo(() => {
    const formContext = `${activeFormForCall?.sector || ""} ${
      activeFormForCall?.name || ""
    }`.toLowerCase();
    if (
      formContext.includes("portabilidade") ||
      formContext.includes("aquisi")
    ) {
      return false;
    }
    if (
      formContext.includes("sac") ||
      formContext.includes("reten") ||
      formContext.includes("cobran")
    ) {
      return true;
    }
    const s = analystSector.toLowerCase();
    return (
      s.includes("sac") ||
      s.includes("reten") ||
      s.includes("cobran") ||
      s.includes("suporte")
    );
  }, [activeFormForCall, analystSector]);

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
    setSaleDateInput(cust.saleDate || "");
    setCustomerNameInput(cust.name || "");
    setCustomerCpfInput(cust.document || "");
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
      if (!ticketInput.trim()) {
        setFlowError(
          "Informe o número do Ticket Zendesk para prosseguir com a avaliação de " +
            analystSector +
            "."
        );
        return;
      }
      if (!dataAtendimentoInput) {
        setFlowError("Informe a Data do Atendimento.");
        return;
      }
      if (!dataMonitoriaInput) {
        setFlowError("Informe a Data da Monitoria.");
        return;
      }
      setStep(2);
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
      setStep(2);
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

      const resolvedPhoneKey = isSacOrRetencao
        ? ticketInput.trim().replace(/^#/, "") || "11999999999"
        : extractCleanPhoneDigits(phoneInput) ||
          phoneInput ||
          customerInfo?.phone ||
          "11999999999";

      const resolvedCustomerName = isSacOrRetencao
        ? `Ticket #${ticketInput.trim().replace(/^#/, "")}`
        : customerNameInput;

      const resolvedCampaign = isSacOrRetencao
        ? `${analystSector} • Ticket #${ticketInput
            .trim()
            .replace(/^#/, "")}`
        : `${analystSector} • Portabilidade`;

      return callsApi.uploadRecording({
        files: validFiles,
        file: validFiles[0],
        analystId,
        customerPhone: resolvedPhoneKey,
        customerName: resolvedCustomerName,
        campaign: resolvedCampaign,
        durationSeconds: totalDuration,
        durations: durationsList,
        ticket: isSacOrRetencao ? ticketInput.trim() : undefined,
        attendanceDate: isSacOrRetencao ? dataAtendimentoInput : undefined,
        monitoringDate: isSacOrRetencao ? dataMonitoriaInput : undefined,
        sector: analystSector,
        formTemplateId: activeFormForCall?.id,
      });
    },
    onSuccess: (createdCall) => {
      setSelectedCall(createdCall);
      setAiSyncStatus("PROCESSING");
      queryClient.invalidateQueries({ queryKey: ["calls-list"] });
      setStep(3);

      // Caso o servidor já tenha retornado metadados de IA ou para disparar direto ao webhook configurado
      const meta = createdCall.metadata || {};
      if (meta.aiEvaluationData) {
        applyAiEvaluationPayload(meta.aiEvaluationData, activeFormForCall);
      } else if (AUDIO_EVALUATION_WEBHOOK_URL) {
        fetch(AUDIO_EVALUATION_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: createdCall.id,
            id_formullario: createdCall.id,
            formTemplateId: activeFormForCall?.id || "",
            externalCallId: createdCall.externalCallId,
            ligacao: createdCall.audioUrl,
            audioUrl: createdCall.audioUrl,
            telefone: createdCall.customerIdentifier,
            Telefone_Portabilidade: createdCall.customerIdentifier,
            Operador: analystId,
            Nome: customerNameInput,
            CPF: customerCpfInput,
            Proposta: proposalInput,
            Data_da_venda: saleDateInput,
          }),
        })
          .then(async (r) => {
            if (!r.ok) return;
            const json = await r.json();
            applyAiEvaluationPayload(json, activeFormForCall);
          })
          .catch(() => {
            // O backend já faz o disparo assíncrono e o polling busca o resultado
          });
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
      <div className="space-y-4 pb-16">
        {/* Top Header Compacto + Seletor Dinâmico de Setor + Stepper */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <Link
              href="/analysts"
              className="p-2 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-zinc-400 hover:text-zinc-100 transition-colors shrink-0"
              title="Voltar para Analistas"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>

            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-zinc-100 truncate">
                {analyst?.name || "Carregando Analista..."}
              </h1>

              {/* Badge Fixo do Setor do Analista (Alteração de setor permitida apenas na tela /analysts) */}
              <span className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-zinc-800 bg-zinc-900 text-xs font-mono text-zinc-300">
                <UserCheck className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                <span>Setor: {analystSector}</span>
              </span>

              {/* Seletor de Formulário de Avaliação */}
              <div className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-zinc-700 bg-[#121215]">
                <FolderKanban className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                <span className="text-[11px] font-mono text-zinc-400">
                  Selecione o formulário:
                </span>
                <select
                  value={activeFormForCall?.id || ""}
                  onChange={(e) => handleFormTemplateSelect(e.target.value)}
                  disabled={isSwitchingForm || existingTemplates.length === 0}
                  aria-label="Selecione o formulário de avaliação"
                  className="bg-transparent text-xs font-semibold text-zinc-100 focus:outline-none cursor-pointer max-w-[240px] truncate"
                >
                  {existingTemplates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id} className="bg-[#0b0b0d]">
                      {tpl.name} ({tpl.maxPossiblePoints} pts)
                    </option>
                  ))}
                </select>
                {isSwitchingForm && (
                  <Loader2 className="h-3 w-3 animate-spin text-zinc-300" />
                )}
              </div>
            </div>
          </div>

          {/* Stepper Enxuto */}
          <div className="w-full sm:w-auto flex items-center gap-1 bg-[#0b0b0d] p-1 rounded-xl border border-zinc-800 shrink-0">
            {(
              [
                { num: 1, label: "1. Dados do Cliente" },
                { num: 2, label: `2. Ligações (${recordings.length})` },
                { num: 3, label: "3. Avaliar" },
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
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                    active
                      ? "bg-zinc-100 text-zinc-950 font-semibold"
                      : done
                      ? "text-zinc-300 hover:bg-zinc-900"
                      : "text-zinc-600 cursor-not-allowed"
                  }`}
                >
                  {done && (
                    <Check className="h-3 w-3 text-emerald-400 shrink-0" />
                  )}
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {flowError && (
          <div className="p-3 rounded-xl border border-red-900/80 bg-red-950/40 text-red-200 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
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

                    {!isSacOrRetencao &&
                      (lookupLoading ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-zinc-300">
                          <Loader2 className="h-3 w-3 animate-spin text-zinc-200" />
                          <span>Consultando...</span>
                        </span>
                      ) : webhookSource ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-950/40 border border-emerald-800/70 text-[11px] font-mono text-emerald-300">
                          <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                          <span>Sincronizado</span>
                        </span>
                      ) : null)}
                  </div>

                  {isSacOrRetencao ? (
                    /* ==============================================================
                       MODO SAC & RETENÇÃO: APENAS OS 3 CAMPOS OBRIGATÓRIOS DA REGRA
                       1. Ticket Zendesk | 2. Data do Atendimento | 3. Data da Monitoria
                       ============================================================== */
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-1">
                      <div>
                        <label className="block text-xs font-medium text-zinc-200 mb-1.5">
                          Ticket Zendesk *
                        </label>
                        <div className="relative">
                          <Hash className="h-3.5 w-3.5 text-zinc-500 absolute left-3 top-3" />
                          <input
                            type="text"
                            required
                            value={ticketInput}
                            onChange={(e) => setTicketInput(e.target.value)}
                            placeholder="Ex: 14705710"
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

                  <div className="flex items-center justify-end pt-2 border-t border-zinc-800/80">
                    <button
                      type="submit"
                      disabled={lookupLoading}
                      className="h-10 px-5 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-zinc-200 text-xs font-semibold inline-flex items-center justify-center gap-2 shrink-0 transition-colors"
                    >
                      <span>
                        {lookupLoading
                          ? "Consultando..."
                          : "Continuar para Ligações"}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </form>
              </motion.div>
            )}

            {/* ====================================================================
                STEP 2: ADICIONAR LIGAÇÕES (LISTA DINÂMICA DE 1, 2, 3 OU MAIS ÁUDIOS)
               ==================================================================== */}
            {step === 2 && (
              <motion.div
                key="step-2"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="max-w-3xl p-5 rounded-xl border border-zinc-800/90 bg-[#0b0b0d] space-y-5"
              >
                {/* Resumo Contextual da Etapa 1 */}
                {isSacOrRetencao ? (
                  <div className="p-3.5 rounded-xl border border-zinc-800 bg-[#121215] grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                    <div>
                      <span className="text-[10px] font-mono text-zinc-500 block">
                        Ticket Zendesk
                      </span>
                      <span className="font-mono text-zinc-100 font-semibold truncate block">
                        #{ticketInput.replace(/^#/, "")}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono text-zinc-500 block">
                        Data do Atendimento
                      </span>
                      <span className="font-mono text-zinc-100 truncate block">
                        {dataAtendimentoInput}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono text-zinc-500 block">
                        Data da Monitoria
                      </span>
                      <span className="font-mono text-zinc-100 truncate block">
                        {dataMonitoriaInput}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl border border-zinc-800 bg-[#121215] grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    <div>
                      <span className="text-[10px] font-mono text-zinc-500 block">
                        Telefone
                      </span>
                      <span className="font-mono text-zinc-100 font-medium truncate block">
                        {extractCleanPhoneDigits(phoneInput) || phoneInput}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono text-zinc-500 block">
                        Nome
                      </span>
                      <span className="text-zinc-100 font-medium truncate block">
                        {customerNameInput || "-"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono text-zinc-500 block">
                        CPF
                      </span>
                      <span className="font-mono text-zinc-100 truncate block">
                        {customerCpfInput || "-"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono text-zinc-500 block">
                        Proposta / Data Venda
                      </span>
                      <span className="font-mono text-zinc-200 truncate block">
                        {proposalInput || "-"} • {saleDateInput || "-"}
                      </span>
                    </div>
                  </div>
                )}

                {/* Cabeçalho da Lista Dinâmica de Ligações */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-zinc-800/80">
                  <div>
                    <h2 className="text-sm font-bold text-zinc-100">
                      Gravações da Avaliação ({recordings.length})
                    </h2>
                    <p className="text-[11px] text-zinc-400">
                      Adicione uma ou mais ligações vinculadas a este
                      atendimento
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

                {/* Array Dinâmico de Ligações */}
                <div className="space-y-3.5">
                  {recordings.map((slot, index) => (
                    <div
                      key={slot.id}
                      className={`p-4 rounded-xl border transition-colors space-y-3 ${
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
                            onClick={() => handleRemoveRecordingSlot(slot.id)}
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
                        className={`p-4 rounded-xl border border-dashed cursor-pointer transition-all flex flex-col sm:flex-row items-center justify-between gap-3 ${
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
                                Obrigatório para validar este slot
                              </p>
                            </div>
                          )}
                        </div>

                        <span className="h-8 px-3 rounded-lg border border-zinc-700 bg-zinc-900 text-[11px] font-medium text-zinc-200 inline-flex items-center shrink-0">
                          {slot.file ? "Trocar arquivo" : "Selecionar arquivo"}
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

                <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="h-9 px-4 rounded-lg border border-zinc-800 text-xs text-zinc-400 hover:text-zinc-100"
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    disabled={uploadAttachmentMutation.isPending}
                    onClick={() => uploadAttachmentMutation.mutate()}
                    className="h-9 px-5 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-zinc-200 text-xs font-semibold inline-flex items-center gap-2"
                  >
                    <Headphones className="h-3.5 w-3.5" />
                    <span>
                      {uploadAttachmentMutation.isPending
                        ? "Enviando áudios..."
                        : `Ir para Avaliação (${recordings.length} áudio${
                            recordings.length > 1 ? "s" : ""
                          })`}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* ====================================================================
                STEP 3: FORMULÁRIO DE MONITORIA (PORTABILIDADE / SAC / RETENÇÃO)
               ==================================================================== */}
            {step === 3 && selectedCall && activeFormForCall && (
              <motion.div
                key="step-3"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="space-y-5"
              >
                {/* Resumo Condicional dos Dados do Cliente na Auditoria */}
                <div className="p-4 rounded-xl border border-zinc-800/90 bg-[#0b0b0d] space-y-3">
                  {isSacOrRetencao ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                      <div className="p-2.5 rounded-lg bg-[#121215] border border-zinc-800/80">
                        <span className="text-[10px] font-mono text-zinc-500 block">
                          Ticket Zendesk
                        </span>
                        <span className="font-mono text-zinc-100 font-semibold block truncate">
                          #{ticketInput.replace(/^#/, "")}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#121215] border border-zinc-800/80">
                        <span className="text-[10px] font-mono text-zinc-500 block">
                          Data do Atendimento
                        </span>
                        <span className="font-mono text-zinc-100 font-medium block truncate">
                          {dataAtendimentoInput}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#121215] border border-zinc-800/80">
                        <span className="text-[10px] font-mono text-zinc-500 block">
                          Data da Monitoria
                        </span>
                        <span className="font-mono text-zinc-100 font-medium block truncate">
                          {dataMonitoriaInput}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 text-xs">
                      <div className="p-2.5 rounded-lg bg-[#121215] border border-zinc-800/80">
                        <span className="text-[10px] font-mono text-zinc-500 block">
                          Telefone
                        </span>
                        <span className="font-mono text-zinc-100 font-medium block truncate">
                          {extractCleanPhoneDigits(phoneInput) ||
                            selectedCall.customerIdentifier}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#121215] border border-zinc-800/80">
                        <span className="text-[10px] font-mono text-zinc-500 block">
                          Data da Venda
                        </span>
                        <span className="font-mono text-zinc-100 font-medium block truncate">
                          {saleDateInput || "-"}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#121215] border border-zinc-800/80">
                        <span className="text-[10px] font-mono text-zinc-500 block">
                          Nome
                        </span>
                        <span className="text-zinc-100 font-medium block truncate">
                          {customerNameInput || "-"}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#121215] border border-zinc-800/80">
                        <span className="text-[10px] font-mono text-zinc-500 block">
                          CPF
                        </span>
                        <span className="font-mono text-zinc-100 font-medium block truncate">
                          {customerCpfInput || "-"}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#121215] border border-zinc-800/80">
                        <span className="text-[10px] font-mono text-zinc-500 block">
                          Plano Contratado
                        </span>
                        <span className="text-zinc-100 font-medium block truncate">
                          {contractedPlanInput || "-"}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#121215] border border-zinc-800/80">
                        <span className="text-[10px] font-mono text-zinc-500 block">
                          Proposta
                        </span>
                        <span className="font-mono text-zinc-100 font-medium block truncate">
                          {proposalInput || "-"}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#121215] border border-zinc-800/80">
                        <span className="text-[10px] font-mono text-zinc-500 block">
                          Forma de Pagamento
                        </span>
                        <span className="text-zinc-100 font-medium block truncate">
                          {paymentMethodInput || "-"}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#121215] border border-zinc-800/80">
                        <span className="text-[10px] font-mono text-zinc-500 block">
                          Vencimento
                        </span>
                        <span className="text-zinc-100 font-medium block truncate">
                          {dueDateInput || "-"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Barra Unificada: Seletor de Formulário + Players de Todas as Ligações Anexadas */}
                <div className="p-4 rounded-xl border border-zinc-800/90 bg-[#0b0b0d] space-y-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <FolderKanban className="h-4 w-4 text-zinc-400 shrink-0" />
                      <select
                        value={activeFormForCall.id}
                        onChange={(e) => {
                          const tpl = existingTemplates.find(
                            (t) => t.id === e.target.value
                          );
                          if (tpl) applyTemplateSelection(tpl);
                        }}
                        aria-label="Selecionar formulário"
                        className="h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs font-medium text-zinc-100 focus:outline-none focus:border-zinc-600 max-w-md w-full truncate"
                      >
                        {existingTemplates.map((tpl) => (
                          <option key={tpl.id} value={tpl.id}>
                            {tpl.name} ({tpl.sector || "Geral"} •{" "}
                            {tpl.maxPossiblePoints} pts)
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

                  {/* Renderiza um Player para cada ligação anexada na avaliação (Funcionalidade de escutar áudio preservada) */}
                  <div className="space-y-2.5">
                    {recordings.map((slot, idx) => (
                      <CallAudioPlayer
                        key={slot.id}
                        audioUrl={slot.previewUrl || selectedCall.audioUrl}
                        externalCallId={`Ligação #${idx + 1} • ${
                          slot.file?.name || selectedCall.externalCallId
                        }`}
                        durationSeconds={
                          slot.durationSeconds || selectedCall.durationSeconds
                        }
                      />
                    ))}
                  </div>
                </div>

                {/* Campo de Transcrição da Ligação (Recebida do Webhook n8n / Editável) */}
                <div className="p-4 rounded-xl border border-zinc-800/90 bg-[#0b0b0d] space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono uppercase tracking-wider font-semibold text-zinc-200">
                        Transcrição da Ligação (Transcricao)
                      </span>
                      {aiSyncStatus === "PROCESSING" && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-zinc-900 border border-zinc-700 text-[11px] font-mono text-zinc-300">
                          <Loader2 className="h-3 w-3 animate-spin text-zinc-200" />
                          <span>
                            Processando transcrição e respostas via webhook...
                          </span>
                        </span>
                      )}
                      {aiSyncStatus === "COMPLETED" && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-950/40 border border-emerald-800/70 text-[11px] font-mono text-emerald-300">
                          <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                          <span>
                            Transcrição e respostas preenchidas automaticamente
                          </span>
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        if (!selectedCall?.id) return;
                        setAiWebhookError(null);
                        setAiSyncStatus("PROCESSING");
                        await callsApi
                          .retryAudioWebhook(selectedCall.id)
                          .catch(() => {});
                      }}
                      className="h-7 px-2.5 rounded-md border border-zinc-800 bg-[#121215] hover:bg-zinc-800 text-[11px] font-mono text-zinc-300 inline-flex items-center gap-1.5 transition-colors"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>Reenviar / Sincronizar Webhook</span>
                    </button>
                  </div>

                  {aiWebhookError && (
                    <div className="p-3 rounded-lg border border-amber-800/70 bg-amber-950/35 text-xs text-amber-200 flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                      <span>{aiWebhookError}</span>
                    </div>
                  )}

                  <textarea
                    rows={7}
                    value={transcricaoInput}
                    onChange={(e) => setTranscricaoInput(e.target.value)}
                    placeholder="A transcrição gerada pelo webhook aparecerá automaticamente aqui (ex: [00:02] Atendente: Alô, boa tarde...). Você também pode colar ou editar o texto."
                    className="w-full p-3.5 rounded-xl border border-zinc-800 bg-[#121215] text-xs font-mono leading-relaxed text-zinc-100 focus:outline-none focus:border-zinc-600"
                  />
                </div>

                {/* Grid Principal: Critérios à Esquerda + Resumo Nota_Final à Direita */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                  <div className="lg:col-span-8 space-y-5">
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                          Critérios ({standardItems.length}) •{" "}
                          {activeFormForCall.name}
                        </span>
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
                          className="text-[11px] font-mono text-zinc-400 hover:text-zinc-100"
                        >
                          Alternar todos
                        </button>
                      </div>

                      <div className="space-y-2">
                        {standardItems.map((item) => {
                          const isChecked = !!checkedMap[item.id];
                          const noteOpen = expandedNoteItemId === item.id;

                          return (
                            <div
                              key={item.id}
                              className={`rounded-xl border transition-all p-3.5 flex flex-col gap-2 ${
                                isChecked
                                  ? "border-zinc-600 bg-[#141418]"
                                  : "border-amber-900/50 bg-[#0b0b0d] hover:border-zinc-700"
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

                                <div className="flex items-center gap-2 shrink-0">
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
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedNoteItemId(
                                        noteOpen ? null : item.id
                                      )
                                    }
                                    className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300"
                                  >
                                    Obs
                                  </button>
                                </div>
                              </div>

                              {(noteOpen || observationMap[item.id]) && (
                                <input
                                  type="text"
                                  value={observationMap[item.id] || ""}
                                  onChange={(e) =>
                                    setObservationMap((prev) => ({
                                      ...prev,
                                      [item.id]: e.target.value,
                                    }))
                                  }
                                  placeholder="Observação específica deste critério..."
                                  className="w-full h-8 px-2.5 rounded-lg border border-zinc-800 bg-[#121215] text-xs text-zinc-200 focus:outline-none focus:border-zinc-600"
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Falta_Grave / falta_grave & Motivo_falta_grave */}
                    {fatalItems.length > 0 && (
                      <div className="space-y-2.5 p-4 rounded-xl border border-zinc-800/90 bg-[#0b0b0d]">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono uppercase tracking-wider text-red-400/90 flex items-center gap-1.5">
                            <ShieldAlert className="h-3.5 w-3.5" />
                            <span>Falta_Grave (Zera Nota_Final = 0)</span>
                          </span>
                          <span className="text-[11px] font-mono text-zinc-400">
                            falta_grave:{" "}
                            <strong
                              className={
                                liveScore.fatalTriggered
                                  ? "text-red-400"
                                  : "text-emerald-400"
                              }
                            >
                              {liveScore.fatalTriggered ? "true" : "false"}
                            </strong>
                          </span>
                        </div>

                        <div className="space-y-2">
                          {fatalItems.map((item) => {
                            const isViolated = !!checkedMap[item.id];
                            return (
                              <div
                                key={item.id}
                                className={`rounded-xl border transition-all p-3.5 ${
                                  isViolated
                                    ? "border-red-600 bg-red-950/30"
                                    : "border-zinc-800/90 bg-[#121215] hover:border-red-900/60"
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

                        <div className="pt-1">
                          <label className="block text-xs font-mono text-zinc-300 mb-1">
                            Motivo_falta_grave
                          </label>
                          <input
                            type="text"
                            value={motivoFaltaGrave}
                            onChange={(e) =>
                              setMotivoFaltaGrave(e.target.value)
                            }
                            placeholder="Descreva o motivo caso haja falta grave..."
                            className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-600"
                          />
                        </div>
                      </div>
                    )}

                    {/* Observacoes / Breve_resumo_do_atendimento + Pontos_fortes + Melhorias */}
                    <div className="space-y-3 p-4 rounded-xl border border-zinc-800/90 bg-[#0b0b0d]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="block text-xs font-mono uppercase tracking-wider text-zinc-300">
                          Observacoes / Breve_resumo_do_atendimento
                        </label>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {[
                            "Possui vício de linguagem (né / tá / aí). ",
                            "Não menciona os canais digitais da administradora. ",
                            "Não solicita confirmação de CPF/e-mail/telefone secundário. ",
                          ].map((snippet) => (
                            <button
                              key={snippet}
                              type="button"
                              onClick={() =>
                                setGeneralFeedback((prev) =>
                                  prev ? `${prev}\n${snippet}` : snippet
                                )
                              }
                              className="px-2 py-0.5 rounded border border-zinc-800 bg-[#121215] hover:border-zinc-600 text-[10px] font-mono text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1"
                            >
                              <Clock className="h-2.5 w-2.5" />
                              <span>{snippet.slice(0, 26)}...</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <textarea
                        rows={5}
                        value={generalFeedback}
                        onChange={(e) => setGeneralFeedback(e.target.value)}
                        placeholder="Breve resumo do atendimento / Observações da monitoria..."
                        className="w-full p-3.5 rounded-xl border border-zinc-800 bg-[#121215] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
                      />

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div>
                          <label className="block text-xs font-mono text-zinc-400 mb-1">
                            Pontos_fortes (Opcional)
                          </label>
                          <input
                            type="text"
                            value={pontosFortes}
                            onChange={(e) => setPontosFortes(e.target.value)}
                            placeholder="Pontos fortes identificados..."
                            className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-mono text-zinc-400 mb-1">
                            Melhorias (Opcional)
                          </label>
                          <input
                            type="text"
                            value={melhorias}
                            onChange={(e) => setMelhorias(e.target.value)}
                            placeholder="Oportunidades de melhoria..."
                            className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Painel Direito: Nota_Final e Publicar */}
                  <div className="lg:col-span-4 rounded-xl border border-zinc-800/90 bg-[#0b0b0d] p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                      <span className="text-xs font-semibold text-zinc-200 font-mono">
                        Nota_Final
                      </span>
                      <span className="text-xs font-mono text-zinc-500">
                        Meta:{" "}
                        {Number(
                          activeFormForCall.passingScorePercentage
                        ).toFixed(0)}
                        %
                      </span>
                    </div>

                    {liveScore.fatalTriggered && (
                      <div className="p-3 rounded-lg bg-red-950/60 border border-red-800 text-red-200 text-xs flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                        <span>falta_grave = true (Nota Zerada)</span>
                      </div>
                    )}

                    <div className="py-5 text-center rounded-xl border border-zinc-800 bg-[#121215]">
                      <p className="text-4xl font-bold tracking-tight text-zinc-50 font-mono tabular-nums">
                        {liveScore.finalPercentage.toFixed(0)}
                      </p>
                      <p className="text-xs text-zinc-400 font-mono mt-1.5 tabular-nums">
                        {liveScore.obtainedPoints} /{" "}
                        {liveScore.maxPossiblePoints} pts (
                        {liveScore.finalPercentage.toFixed(1)}%)
                      </p>
                    </div>

                    <div className="p-3 rounded-lg border border-zinc-800/80 bg-[#121215] space-y-1.5 text-[11px] font-mono">
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Setor:</span>
                        <span className="text-zinc-200">
                          {analystSector}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Formulário:</span>
                        <span className="text-zinc-200 truncate max-w-[160px]">
                          {activeFormForCall.name}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Ligações:</span>
                        <span className="text-zinc-200">
                          {recordings.length} arquivo(s)
                        </span>
                      </div>
                      {isSacOrRetencao ? (
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Ticket Zendesk:</span>
                          <span className="text-zinc-200">#{ticketInput}</span>
                        </div>
                      ) : (
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Telefone:</span>
                          <span className="text-zinc-200">
                            {extractCleanPhoneDigits(phoneInput) ||
                              selectedCall.customerIdentifier}
                          </span>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={submitEvaluationMutation.isPending}
                      onClick={() => submitEvaluationMutation.mutate()}
                      className="w-full h-10 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-zinc-200 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
                    >
                      <FileCheck2 className="h-4 w-4" />
                      <span>
                        {submitEvaluationMutation.isPending
                          ? "Salvando..."
                          : "Publicar Monitoria"}
                      </span>
                    </button>
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
