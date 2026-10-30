"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  FileAudio,
  FileCheck2,
  FolderKanban,
  Headphones,
  Loader2,
  Phone,
  RefreshCw,
  ShieldAlert,
  UploadCloud,
  User,
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
import { formatDuration, formatPhoneMask } from "@/lib/utils";
import { CallRecord, CustomerInfo, FormTemplate } from "@/types";

type FlowStep = 1 | 2 | 3;

const DIRECTUS_WEBHOOK_URL =
  process.env.NEXT_PUBLIC_CUSTOMER_WEBHOOK_URL || "";

const QUICK_PHONES = [
  "(11) 99999-9999",
  "(11) 98811-2233",
  "(11) 97744-5566",
  "(21) 99988-7766",
];

function extractCleanPhoneDigits(raw: string): string {
  const trimmed = (raw || "").trim().replace(/^\+55\s*/, "");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return digits.slice(2);
  }
  return digits;
}

export default function AnalystEvaluationFlowPage() {
  const params = useParams<{ id: string }>();
  const analystId = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isGestor } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const returnFileInputRef = useRef<HTMLInputElement | null>(null);

  const [step, setStep] = useState<FlowStep>(1);
  const [flowError, setFlowError] = useState<string | null>(null);

  // Etapa 1: Telefone_Portabilidade + 13 Dados puxados automaticamente via POST Webhook
  const [phoneInput, setPhoneInput] = useState("");
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [webhookSource, setWebhookSource] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const lastLookedUpDigitsRef = useRef<string>("");

  // Os 13 campos de Dados do Cliente / Venda
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

  // Etapa 2: Audio_Ligacao + Audio_Ligacao_Retorno (Monitoria_Tim_Aquisicao)
  const [campaignInput, setCampaignInput] = useState(
    "Monitoria_Tim_Aquisicao"
  );
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [detectedDuration, setDetectedDuration] = useState<number>(185);
  const [returnAudioFile, setReturnAudioFile] = useState<File | null>(null);
  const [returnPreviewUrl, setReturnPreviewUrl] = useState<string | null>(null);
  const [returnDuration, setReturnDuration] = useState<number>(120);
  const [selectedCall, setSelectedCall] = useState<CallRecord | null>(null);

  // Etapa 3: Avaliar (Formulário de Portabilidade + Falta_Grave + Motivo_falta_grave + Observacoes + Nota_Final)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [checkedMap, setCheckedMap] = useState<Record<string, boolean>>({});
  const [observationMap, setObservationMap] = useState<Record<string, string>>(
    {}
  );
  const [generalFeedback, setGeneralFeedback] = useState("");
  const [motivoFaltaGrave, setMotivoFaltaGrave] = useState("N/A");
  const [expandedNoteItemId, setExpandedNoteItemId] = useState<string | null>(
    null
  );

  const { data: analyst } = useQuery({
    queryKey: ["analyst-profile", analystId],
    queryFn: () => usersApi.getById(analystId),
    enabled: !!analystId && isGestor,
  });

  const { data: existingTemplates = [] } = useQuery({
    queryKey: ["active-forms"],
    queryFn: () => formsApi.list(true),
    enabled: isGestor,
  });

  useEffect(() => {
    if (existingTemplates.length === 0) return;
    if (
      selectedTemplateId &&
      existingTemplates.some((t) => t.id === selectedTemplateId)
    ) {
      return;
    }

    // Prioriza o Formulário de Portabilidade (Monitoria TIM Aquisição - Portabilidade)
    const portabilidadeMatch = existingTemplates.find(
      (t) =>
        t.name.toLowerCase().includes("portabilidade") ||
        t.name.toLowerCase().includes("tim aquisição") ||
        t.name.toLowerCase().includes("tim aquisicao")
    );

    const sectorMatch = analyst?.department
      ? existingTemplates.find(
          (t) =>
            t.sector &&
            t.sector.toLowerCase() === analyst.department.toLowerCase()
        )
      : null;

    const chosen = portabilidadeMatch || sectorMatch || existingTemplates[0];
    if (chosen) {
      handleSelectTemplate(chosen);
    }
  }, [analyst?.department, existingTemplates, selectedTemplateId]);

  const activeFormForCall = useMemo<FormTemplate | null>(() => {
    if (!selectedTemplateId) return existingTemplates[0] || null;
    return (
      existingTemplates.find((t) => t.id === selectedTemplateId) ||
      existingTemplates[0] ||
      null
    );
  }, [existingTemplates, selectedTemplateId]);

  const handleSelectTemplate = (tpl: FormTemplate) => {
    setSelectedTemplateId(tpl.id);
    const initialChecks: Record<string, boolean> = {};
    tpl.items.forEach((item) => {
      // No formulário de Portabilidade, os itens padrão iniciam marcados (100 pts) para deduzir apenas as falhas encontradas, ou desmarcados nos itens fatais
      initialChecks[item.id] = !item.fatalError;
    });
    setCheckedMap(initialChecks);
    setObservationMap({});
  };

  const applyCustomerFields = (cust: CustomerInfo) => {
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
  };

  // Disparo POST para o Webhook configurado em NEXT_PUBLIC_CUSTOMER_WEBHOOK_URL
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
    [analystId, customerCpfInput, customerMotherInput, customerNameInput]
  );

  // Auto-pull sempre que o usuário digitar/colar um telefone completo (10 ou 11 dígitos)
  useEffect(() => {
    const cleanDigits = extractCleanPhoneDigits(phoneInput);
    if (cleanDigits.length >= 10 && cleanDigits.length <= 11) {
      const timer = setTimeout(() => {
        pullContactFromWebhook(phoneInput);
      }, 320);
      return () => clearTimeout(timer);
    }
  }, [phoneInput, pullContactFromWebhook]);

  const handleProceedToStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    setFlowError(null);
    const cleanDigits = extractCleanPhoneDigits(phoneInput);
    if (cleanDigits.length < 8) {
      setFlowError(
        "Informe um Telefone_Portabilidade válido para puxar os dados."
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
            phone: cleanDigits,
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

  const handleFileChange = (file: File | null) => {
    if (!file) return;
    setUploadedFile(file);
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
    }
    const objUrl = URL.createObjectURL(file);
    setLocalPreviewUrl(objUrl);

    const tempAudio = new Audio(objUrl);
    tempAudio.addEventListener("loadedmetadata", () => {
      if (tempAudio.duration && isFinite(tempAudio.duration)) {
        setDetectedDuration(Math.max(1, Math.round(tempAudio.duration)));
      }
    });
  };

  const handleReturnFileChange = (file: File | null) => {
    if (!file) return;
    setReturnAudioFile(file);
    if (returnPreviewUrl) {
      URL.revokeObjectURL(returnPreviewUrl);
    }
    const objUrl = URL.createObjectURL(file);
    setReturnPreviewUrl(objUrl);

    const tempAudio = new Audio(objUrl);
    tempAudio.addEventListener("loadedmetadata", () => {
      if (tempAudio.duration && isFinite(tempAudio.duration)) {
        setReturnDuration(Math.max(1, Math.round(tempAudio.duration)));
      }
    });
  };

  const uploadAttachmentMutation = useMutation({
    mutationFn: async () => {
      setFlowError(null);
      return callsApi.uploadRecording({
        file: uploadedFile,
        analystId,
        customerPhone: extractCleanPhoneDigits(phoneInput) || phoneInput,
        customerName: customerNameInput,
        campaign: campaignInput,
        durationSeconds: detectedDuration,
      });
    },
    onSuccess: (createdCall) => {
      setSelectedCall(createdCall);
      queryClient.invalidateQueries({ queryKey: ["calls-list"] });
      setStep(3);
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

  const liveScore = useMemo(() => {
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
        status: "ZERADO_ERRO_GRAVE" as const,
      };
    }

    const passing = activeFormForCall
      ? Number(activeFormForCall.passingScorePercentage)
      : 80;

    return {
      obtainedPoints,
      maxPossiblePoints,
      rawPercentage,
      finalPercentage: rawPercentage,
      fatalTriggered: false,
      status:
        rawPercentage >= passing
          ? ("APROVADO" as const)
          : ("REPROVADO" as const),
    };
  }, [activeFormForCall, standardItems, fatalItems, checkedMap]);

  const submitEvaluationMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCall || !activeFormForCall) {
        throw new Error("Chamada ou formulário não selecionado.");
      }
      const consolidatedFeedback = liveScore.fatalTriggered
        ? `${generalFeedback.trim()}\n\n[Motivo_falta_grave]: ${
            motivoFaltaGrave.trim() || "Falta Grave acionada"
          }`.trim()
        : generalFeedback.trim();

      return evaluationsApi.submit({
        callRecordId: selectedCall.id,
        formTemplateId: activeFormForCall.id,
        answers: activeFormForCall.items.map((item) => ({
          formItemId: item.id,
          checked: !!checkedMap[item.id],
          observation:
            item.fatalError && checkedMap[item.id]
              ? motivoFaltaGrave || observationMap[item.id] || undefined
              : observationMap[item.id] || undefined,
        })),
        generalFeedback: consolidatedFeedback,
      });
    },
    onSuccess: (createdEvaluation) => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["calls-list"] });
      queryClient.invalidateQueries({ queryKey: ["evaluations-list"] });
      router.push(`/evaluations/${createdEvaluation.id}`);
    },
    onError: (err) => {
      setFlowError(extractErrorMessage(err));
    },
  });

  if (!isGestor) {
    return (
      <AppShell>
        <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-300 text-sm">
          Acesso restrito ao perfil de Gestão.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-5 pb-16">
        {/* Header Compacto */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-800/80">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/analysts")}
              aria-label="Voltar para analistas"
              className="h-8 w-8 rounded-lg border border-zinc-800 bg-[#0b0b0d] flex items-center justify-center text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base font-bold text-zinc-100">
                {analyst ? analyst.name : "Operador"}
              </h1>
              {analyst?.department && (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
                  {analyst.department}
                </span>
              )}
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
                Monitoria_Tim_Aquisicao
              </span>
              {selectedCall && (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
                  #{selectedCall.externalCallId}
                </span>
              )}
            </div>
          </div>

          {/* Stepper Enxuto */}
          <div className="w-full sm:w-auto flex items-center gap-1 bg-[#0b0b0d] p-1 rounded-xl border border-zinc-800">
            {(
              [
                { num: 1, label: "1. Cliente" },
                { num: 2, label: "2. Áudio" },
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

        <AnimatePresence mode="wait">
          {/* ====================================================================
              STEP 1: TELEFONE_PORTABILIDADE & 13 DADOS DO CLIENTE (AUTO-LOOKUP POST)
             ==================================================================== */}
          {step === 1 && (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="max-w-4xl p-5 rounded-xl border border-zinc-800/90 bg-[#0b0b0d] space-y-5"
            >
              <form onSubmit={handleProceedToStep2} className="space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-800/80">
                  <div>
                    <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                      <User className="h-4 w-4 text-zinc-400" />
                      <span>Dados • Monitoria TIM Aquisição (Portabilidade)</span>
                    </h2>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Informe o{" "}
                      <span className="font-mono text-zinc-300">
                        Telefone_Portabilidade
                      </span>{" "}
                      para puxar automaticamente os 13 campos via{" "}
                      <span className="font-mono text-zinc-300">
                        POST /webhook/buscar-dados-directus
                      </span>
                    </p>
                  </div>

                  {lookupLoading ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-zinc-300">
                      <Loader2 className="h-3 w-3 animate-spin text-zinc-200" />
                      <span>Puxando dados...</span>
                    </span>
                  ) : webhookSource ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-950/40 border border-emerald-800/70 text-[11px] font-mono text-emerald-300">
                      <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                      <span>{webhookSource}</span>
                    </span>
                  ) : null}
                </div>

                {/* Campo Principal: Telefone_Portabilidade */}
                <div className="space-y-2 pb-2 border-b border-zinc-800/60">
                  <label className="block text-xs font-medium text-zinc-300">
                    Telefone_Portabilidade (puxa os dados sozinho ao digitar)
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
                      onClick={() => pullContactFromWebhook(phoneInput, true)}
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

                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="text-[11px] text-zinc-500 mr-1">
                      Telefones da Monitoria (JSON):
                    </span>
                    {QUICK_PHONES.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          setPhoneInput(p);
                          pullContactFromWebhook(p, true);
                        }}
                        className="px-2.5 py-1 rounded-md border border-zinc-800 bg-[#121215] hover:border-zinc-600 text-[11px] font-mono text-zinc-400 hover:text-zinc-200 transition-colors"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Os 13 Campos de Dados Preenchidos Automaticamente pelo Webhook POST */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">
                      Data Da Venda
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
                      onChange={(e) => setCustomerNameInput(e.target.value)}
                      placeholder="Nome completo..."
                      className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">
                      Cpf
                    </label>
                    <input
                      type="text"
                      value={customerCpfInput}
                      onChange={(e) => setCustomerCpfInput(e.target.value)}
                      placeholder="000.000.000-00"
                      className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">
                      Data De Nascimento
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
                      Nome Da Mae
                    </label>
                    <input
                      type="text"
                      value={customerMotherInput}
                      onChange={(e) => setCustomerMotherInput(e.target.value)}
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
                      onChange={(e) => setContractedPlanInput(e.target.value)}
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
                      Email
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
                      Forma De Pagamento
                    </label>
                    <input
                      type="text"
                      value={paymentMethodInput}
                      onChange={(e) => setPaymentMethodInput(e.target.value)}
                      placeholder="Forma de pagamento..."
                      className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">
                      Tipo De Fatura
                    </label>
                    <input
                      type="text"
                      value={invoiceTypeInput}
                      onChange={(e) => setInvoiceTypeInput(e.target.value)}
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
                      onChange={(e) => setEarlyPortabilityInput(e.target.value)}
                      placeholder="Sim / Não"
                      className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
                    />
                  </div>

                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="block text-xs font-medium text-zinc-300 mb-1">
                      Endereco Completo
                    </label>
                    <input
                      type="text"
                      value={fullAddressInput}
                      onChange={(e) => setFullAddressInput(e.target.value)}
                      placeholder="Rua, número, bairro, cidade - UF, CEP..."
                      className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end pt-2 border-t border-zinc-800/80">
                  <button
                    type="submit"
                    disabled={lookupLoading}
                    className="h-10 px-5 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-zinc-200 text-xs font-semibold inline-flex items-center justify-center gap-2 shrink-0 transition-colors"
                  >
                    <span>
                      {lookupLoading ? "Consultando..." : "Continuar para Áudio"}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {/* ====================================================================
              STEP 2: ANEXAR ÁUDIO (Audio_Ligacao + Audio_Ligacao_Retorno)
             ==================================================================== */}
          {step === 2 && (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="max-w-3xl p-5 rounded-xl border border-zinc-800/90 bg-[#0b0b0d] space-y-5"
            >
              {/* Resumo dos Dados puxados pelo Webhook */}
              <div className="p-3.5 rounded-xl border border-zinc-800 bg-[#121215] grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div>
                  <span className="text-[10px] font-mono text-zinc-500 block">
                    Telefone_Portabilidade
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
                    Cpf
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Cliente
                  </label>
                  <input
                    type="text"
                    value={customerNameInput}
                    onChange={(e) => setCustomerNameInput(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Coleção / Campanha
                  </label>
                  <input
                    type="text"
                    value={campaignInput}
                    onChange={(e) => setCampaignInput(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-600"
                  />
                </div>
              </div>

              {/* Audio_Ligacao (Principal) & Audio_Ligacao_Retorno (Opcional) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <span className="block text-xs font-mono text-zinc-300">
                    Audio_Ligacao (Gravação Principal) *
                  </span>
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        handleFileChange(e.dataTransfer.files[0]);
                      }
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`p-5 rounded-xl border border-dashed cursor-pointer transition-all flex flex-col items-center justify-center text-center gap-2 ${
                      uploadedFile
                        ? "border-zinc-500 bg-[#141418]"
                        : "border-zinc-800 hover:border-zinc-600 bg-[#121215]"
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="audio/*,.mp3,.wav,.ogg,.m4a,.webm"
                      className="hidden"
                      onChange={(e) =>
                        handleFileChange(
                          e.target.files && e.target.files[0]
                            ? e.target.files[0]
                            : null
                        )
                      }
                    />
                    <div className="h-9 w-9 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                      {uploadedFile ? (
                        <FileAudio className="h-4 w-4 text-zinc-100" />
                      ) : (
                        <UploadCloud className="h-4 w-4 text-zinc-400" />
                      )}
                    </div>
                    {uploadedFile ? (
                      <div>
                        <p className="text-xs font-semibold text-zinc-100 truncate max-w-[200px]">
                          {uploadedFile.name}
                        </p>
                        <p className="text-[11px] text-zinc-500 font-mono">
                          {(uploadedFile.size / 1024).toFixed(1)} KB •{" "}
                          {formatDuration(detectedDuration)}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs font-medium text-zinc-300">
                        Anexar Audio_Ligacao (MP3, WAV, OGG)
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="block text-xs font-mono text-zinc-400">
                    Audio_Ligacao_Retorno (Opcional)
                  </span>
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        handleReturnFileChange(e.dataTransfer.files[0]);
                      }
                    }}
                    onClick={() => returnFileInputRef.current?.click()}
                    className={`p-5 rounded-xl border border-dashed cursor-pointer transition-all flex flex-col items-center justify-center text-center gap-2 ${
                      returnAudioFile
                        ? "border-zinc-500 bg-[#141418]"
                        : "border-zinc-800 hover:border-zinc-600 bg-[#121215]"
                    }`}
                  >
                    <input
                      ref={returnFileInputRef}
                      type="file"
                      accept="audio/*,.mp3,.wav,.ogg,.m4a,.webm"
                      className="hidden"
                      onChange={(e) =>
                        handleReturnFileChange(
                          e.target.files && e.target.files[0]
                            ? e.target.files[0]
                            : null
                        )
                      }
                    />
                    <div className="h-9 w-9 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                      {returnAudioFile ? (
                        <FileAudio className="h-4 w-4 text-zinc-100" />
                      ) : (
                        <UploadCloud className="h-4 w-4 text-zinc-500" />
                      )}
                    </div>
                    {returnAudioFile ? (
                      <div>
                        <p className="text-xs font-semibold text-zinc-100 truncate max-w-[200px]">
                          {returnAudioFile.name}
                        </p>
                        <p className="text-[11px] text-zinc-500 font-mono">
                          {(returnAudioFile.size / 1024).toFixed(1)} KB •{" "}
                          {formatDuration(returnDuration)}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs font-medium text-zinc-400">
                        Anexar Audio_Ligacao_Retorno (se houver)
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {localPreviewUrl && (
                <CallAudioPlayer
                  audioUrl={localPreviewUrl}
                  externalCallId={uploadedFile?.name || "Audio_Ligacao"}
                  durationSeconds={detectedDuration}
                />
              )}

              {returnPreviewUrl && (
                <CallAudioPlayer
                  audioUrl={returnPreviewUrl}
                  externalCallId={
                    returnAudioFile?.name || "Audio_Ligacao_Retorno"
                  }
                  durationSeconds={returnDuration}
                />
              )}

              <div className="flex items-center justify-between pt-2">
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
                      ? "Carregando..."
                      : "Ir para Avaliação"}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </motion.div>
          )}

          {/* ====================================================================
              STEP 3: FORMULÁRIO DE PORTABILIDADE (Monitoria_Tim_Aquisicao)
             ==================================================================== */}
          {step === 3 && selectedCall && activeFormForCall && (
            <motion.div
              key="step-3"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="space-y-5"
            >
              {/* Card com os 13 Dados do Cliente para Conferência na Auditoria */}
              <div className="p-4 rounded-xl border border-zinc-800/90 bg-[#0b0b0d] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-200 uppercase font-mono">
                    Dados • Telefone_Portabilidade:{" "}
                    {extractCleanPhoneDigits(phoneInput) ||
                      selectedCall.customerIdentifier}
                  </span>
                  {webhookSource && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-300 border border-emerald-800/70">
                      {webhookSource}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 text-xs">
                  <div className="p-2.5 rounded-lg bg-[#121215] border border-zinc-800/80">
                    <span className="text-[10px] font-mono text-zinc-500 block">
                      Data Da Venda
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
                      Cpf
                    </span>
                    <span className="font-mono text-zinc-100 font-medium block truncate">
                      {customerCpfInput || "-"}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#121215] border border-zinc-800/80">
                    <span className="text-[10px] font-mono text-zinc-500 block">
                      Data De Nascimento
                    </span>
                    <span className="font-mono text-zinc-100 font-medium block truncate">
                      {birthDateInput || "-"}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#121215] border border-zinc-800/80">
                    <span className="text-[10px] font-mono text-zinc-500 block">
                      Nome Da Mae
                    </span>
                    <span className="text-zinc-100 font-medium block truncate">
                      {customerMotherInput || "-"}
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
                      Email
                    </span>
                    <span className="font-mono text-zinc-100 font-medium block truncate">
                      {emailInput || "-"}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#121215] border border-zinc-800/80">
                    <span className="text-[10px] font-mono text-zinc-500 block">
                      Forma De Pagamento
                    </span>
                    <span className="text-zinc-100 font-medium block truncate">
                      {paymentMethodInput || "-"}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#121215] border border-zinc-800/80">
                    <span className="text-[10px] font-mono text-zinc-500 block">
                      Tipo De Fatura
                    </span>
                    <span className="text-zinc-100 font-medium block truncate">
                      {invoiceTypeInput || "-"}
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
                  <div className="p-2.5 rounded-lg bg-[#121215] border border-zinc-800/80">
                    <span className="text-[10px] font-mono text-zinc-500 block">
                      Portabilidade Antecipada
                    </span>
                    <span className="text-zinc-100 font-medium block truncate">
                      {earlyPortabilityInput || "-"}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#121215] border border-zinc-800/80 col-span-2 sm:col-span-3 lg:col-span-4">
                    <span className="text-[10px] font-mono text-zinc-500 block">
                      Endereco Completo
                    </span>
                    <span className="text-zinc-100 font-medium block">
                      {fullAddressInput || "-"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Barra Unificada: Seletor de Formulário + Player de Audio_Ligacao (& Audio_Ligacao_Retorno) */}
              <div className="p-4 rounded-xl border border-zinc-800/90 bg-[#0b0b0d] space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Seletor de Formulário Compacto */}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <FolderKanban className="h-4 w-4 text-zinc-400 shrink-0" />
                    <select
                      value={activeFormForCall.id}
                      onChange={(e) => {
                        const tpl = existingTemplates.find(
                          (t) => t.id === e.target.value
                        );
                        if (tpl) handleSelectTemplate(tpl);
                      }}
                      aria-label="Selecionar formulário"
                      className="h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs font-medium text-zinc-100 focus:outline-none focus:border-zinc-600 max-w-md w-full truncate"
                    >
                      {existingTemplates.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.name} ({tpl.sector || "Geral"})
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

                  {/* Nota_Final Compacta */}
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

                <CallAudioPlayer
                  audioUrl={localPreviewUrl || selectedCall.audioUrl}
                  externalCallId={`Audio_Ligacao • ${selectedCall.externalCallId}`}
                  durationSeconds={selectedCall.durationSeconds}
                />

                {returnPreviewUrl && (
                  <CallAudioPlayer
                    audioUrl={returnPreviewUrl}
                    externalCallId={`Audio_Ligacao_Retorno • ${
                      returnAudioFile?.name || "retorno"
                    }`}
                    durationSeconds={returnDuration}
                  />
                )}
              </div>

              {/* Grid Principal: Critérios de Portabilidade à Esquerda + Resumo Nota_Final à Direita */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                <div className="lg:col-span-8 space-y-5">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                        Critérios de Portabilidade ({standardItems.length})
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
                                    ? `+${item.points || 1} pts`
                                    : `-${item.points || 1} pts`}
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
                                placeholder="Ex: [04:10] Não informou franquia de 550 minutos..."
                                className="w-full h-8 px-2.5 rounded-lg border border-zinc-800 bg-[#121215] text-xs text-zinc-200 focus:outline-none focus:border-zinc-600"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Falta_Grave & Motivo_falta_grave */}
                  {fatalItems.length > 0 && (
                    <div className="space-y-2.5 p-4 rounded-xl border border-zinc-800/90 bg-[#0b0b0d]">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono uppercase tracking-wider text-red-400/90 flex items-center gap-1.5">
                          <ShieldAlert className="h-3.5 w-3.5" />
                          <span>Falta_Grave (Zera Nota_Final = 0)</span>
                        </span>
                        <span className="text-[11px] font-mono text-zinc-400">
                          Falta_Grave:{" "}
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
                                      if (checked && motivoFaltaGrave === "N/A") {
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
                          onChange={(e) => setMotivoFaltaGrave(e.target.value)}
                          placeholder="Ex: [00:08] Cliente divergente; [03:38] CPF divergente do registrado na venda"
                          className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-600"
                        />
                      </div>
                    </div>
                  )}

                  {/* Observacoes (com atalhos de minutagem [MM:SS] do JSON) */}
                  <div className="space-y-2 p-4 rounded-xl border border-zinc-800/90 bg-[#0b0b0d]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="block text-xs font-mono uppercase tracking-wider text-zinc-300">
                        Observacoes
                      </label>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {[
                          "[01:00] Não informou franquia de 550 minutos; ",
                          "[02:30] Uso de diminutivo/gerundismo; ",
                          "[04:20] Não ofertou opção de eSIM (*#06#); ",
                          "[06:30] Não informou exceção de voz/vídeo no WhatsApp; ",
                          "[10:00] Não instruiu SMS 7678 (TIM); ",
                        ].map((snippet) => (
                          <button
                            key={snippet}
                            type="button"
                            onClick={() =>
                              setGeneralFeedback((prev) =>
                                prev ? `${prev}${snippet}` : snippet
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
                      placeholder="[04:10] Uso de gerundismo; [10:10] Informou 50 minutos ao invés de 550 minutos do plano...&#10;&#10;Resumo da monitoria de portabilidade..."
                      className="w-full p-3.5 rounded-xl border border-zinc-800 bg-[#121215] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
                    />
                  </div>
                </div>

                {/* Painel Direito: Nota_Final e Salvar */}
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
                      <span>Falta_Grave = true (Nota Zerada)</span>
                    </div>
                  )}

                  <div className="py-5 text-center rounded-xl border border-zinc-800 bg-[#121215]">
                    <p className="text-4xl font-bold tracking-tight text-zinc-50 font-mono">
                      {liveScore.finalPercentage.toFixed(0)}
                    </p>
                    <p className="text-xs text-zinc-400 font-mono mt-1.5">
                      {liveScore.obtainedPoints} / {liveScore.maxPossiblePoints}{" "}
                      pts ({liveScore.finalPercentage.toFixed(1)}%)
                    </p>
                  </div>

                  <div className="p-3 rounded-lg border border-zinc-800/80 bg-[#121215] space-y-1.5 text-[11px] font-mono">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">
                        Telefone_Portabilidade:
                      </span>
                      <span className="text-zinc-200">
                        {extractCleanPhoneDigits(phoneInput) ||
                          selectedCall.customerIdentifier}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Data_da_venda:</span>
                      <span className="text-zinc-200">
                        {saleDateInput || "-"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Falta_Grave:</span>
                      <span
                        className={
                          liveScore.fatalTriggered
                            ? "text-red-400 font-bold"
                            : "text-emerald-400"
                        }
                      >
                        {liveScore.fatalTriggered ? "true" : "false"}
                      </span>
                    </div>
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
      </div>
    </AppShell>
  );
}
