"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  Headphones,
  Loader2,
  Phone,
  Search,
  User,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { CallAudioPlayer } from "@/components/audio/CallAudioPlayer";
import { useAuth } from "@/context/AuthContext";
import { customersApi, extractErrorMessage } from "@/lib/api";
import {
  extractCleanPhoneDigits,
  formatDateTime,
  formatDuration,
  getEvaluationStatusBadge,
  stripPlus55,
} from "@/lib/utils";
import { CustomerLookupResponse } from "@/types";

const DIRECTUS_WEBHOOK_URL =
  process.env.NEXT_PUBLIC_CUSTOMER_WEBHOOK_URL || "";

export default function CustomerLookupPage() {
  const { isGestor } = useAuth();
  const [searchKey, setSearchKey] = useState("");
  const [keyType, setKeyType] = useState("TELEFONE");
  const [lookupData, setLookupData] = useState<CustomerLookupResponse | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeAudioCallId, setActiveAudioCallId] = useState<string | null>(
    null
  );
  const lastAutoPhoneRef = useRef<string>("");

  const performLookup = useCallback(
    async (keyToSearch: string, overrideType?: string, force = false) => {
      const cleaned = stripPlus55(keyToSearch);
      if (!cleaned || cleaned.length < 3) return;

      const digits = extractCleanPhoneDigits(cleaned);
      if (!force && digits.length >= 10 && lastAutoPhoneRef.current === digits) {
        return;
      }
      if (digits.length >= 10) {
        lastAutoPhoneRef.current = digits;
      }

      setError(null);
      setIsLoading(true);
      try {
        const res = await customersApi.triggerWebhookLookup({
          searchKey: cleaned,
          phone: cleaned,
          keyType: overrideType || keyType,
          webhookUrl: DIRECTUS_WEBHOOK_URL,
        });
        setLookupData(res);
        if (res.recordings.length > 0) {
          setActiveAudioCallId(res.recordings[0].id);
        }
      } catch (err) {
        setError(extractErrorMessage(err));
      } finally {
        setIsLoading(false);
      }
    },
    [keyType]
  );

  // Auto-lookup sempre que digitar/colar um telefone completo (10 ou 11 dígitos)
  useEffect(() => {
    const digits = extractCleanPhoneDigits(searchKey);
    if (
      (keyType === "TELEFONE" || keyType === "AUTO") &&
      digits.length >= 10 &&
      digits.length <= 11
    ) {
      const timer = setTimeout(() => {
        performLookup(searchKey, "TELEFONE");
      }, 320);
      return () => clearTimeout(timer);
    }
  }, [searchKey, keyType, performLookup]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performLookup(searchKey, keyType, true);
  };

  if (!isGestor) {
    return (
      <AppShell>
        <div className="p-6 rounded-xl bg-red-950/40 border border-red-800 text-red-300 text-sm">
          Acesso restrito ao perfil de Gestão.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6 pb-16">
        <div>
          <h1 className="text-lg font-bold text-zinc-100">
            Busca de Clientes
          </h1>
        </div>

        {/* Search Card */}
        <div className="bg-[#0b0b0d] rounded-xl border border-zinc-800 p-5 space-y-4">
          <form
            onSubmit={handleSubmit}
            className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3"
          >
            <div className="sm:w-48">
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Parâmetro de Busca
              </label>
              <select
                value={keyType}
                onChange={(e) => setKeyType(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
              >
                <option value="TELEFONE">Telefone (Auto-puxar)</option>
                <option value="CPF">CPF</option>
                <option value="NOME">Nome da Pessoa</option>
                <option value="AUTO">Detectar Automaticamente</option>
              </select>
            </div>

            <div className="flex-1">
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Telefone do Contato (puxa sozinho ao preencher)
              </label>
              <div className="relative">
                <Phone className="h-4 w-4 text-zinc-500 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={searchKey}
                  onChange={(e) => setSearchKey(stripPlus55(e.target.value))}
                  placeholder="Digite ou cole o telefone ex: 11999999999"
                  className="w-full h-10 pl-10 pr-4 rounded-lg border border-zinc-800 bg-[#121215] text-sm font-mono text-zinc-100 focus:outline-none focus:border-zinc-600"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="h-10 px-5 rounded-lg bg-zinc-100 hover:bg-zinc-200 disabled:opacity-50 text-zinc-950 text-xs font-semibold flex items-center justify-center gap-2 transition-all"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              <span>{isLoading ? "Puxando..." : "Puxar Dados (POST)"}</span>
            </button>
          </form>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-950/50 border border-red-900 flex items-center gap-2.5 text-red-200 text-xs font-medium">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Lookup Results */}
        <AnimatePresence mode="wait">
          {lookupData && (
            <motion.div
              key={lookupData.customer.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="space-y-5"
            >
              {/* Card com os 13 Campos de Dados solicitados */}
              <div className="bg-[#0b0b0d] rounded-xl border border-zinc-800 p-5 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-200 flex items-center justify-center">
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-zinc-100">
                        Dados • {lookupData.customer.name}
                      </h2>
                      <p className="text-xs text-zinc-400 font-mono">
                        Telefone: {stripPlus55(lookupData.customer.phone)} •
                        CPF: {lookupData.customer.document}
                      </p>
                    </div>
                  </div>

                  <span className="px-2.5 py-1 rounded-md text-xs font-mono bg-emerald-950/40 text-emerald-300 border border-emerald-800/70">
                    {lookupData.source}
                  </span>
                </div>

                {/* Os 13 Campos de Dados */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-[#121215] border border-zinc-800">
                    <span className="text-zinc-500 text-[11px] block">
                      Data Da Venda
                    </span>
                    <span className="font-mono font-semibold text-zinc-100 mt-0.5 block">
                      {lookupData.customer.saleDate || "-"}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-[#121215] border border-zinc-800">
                    <span className="text-zinc-500 text-[11px] block">
                      Nome
                    </span>
                    <span className="font-semibold text-zinc-100 mt-0.5 block">
                      {lookupData.customer.name || "-"}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-[#121215] border border-zinc-800">
                    <span className="text-zinc-500 text-[11px] block">
                      Cpf
                    </span>
                    <span className="font-mono font-semibold text-zinc-100 mt-0.5 block">
                      {lookupData.customer.document || "-"}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-[#121215] border border-zinc-800">
                    <span className="text-zinc-500 text-[11px] block">
                      Data De Nascimento
                    </span>
                    <span className="font-mono font-semibold text-zinc-100 mt-0.5 block">
                      {lookupData.customer.birthDate || "-"}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-[#121215] border border-zinc-800 sm:col-span-2">
                    <span className="text-zinc-500 text-[11px] block">
                      Nome Da Mae
                    </span>
                    <span className="font-semibold text-zinc-100 mt-0.5 block">
                      {lookupData.customer.motherName || "-"}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-[#121215] border border-zinc-800 sm:col-span-2">
                    <span className="text-zinc-500 text-[11px] block">
                      Plano Contratado
                    </span>
                    <span className="font-semibold text-zinc-100 mt-0.5 block">
                      {lookupData.customer.contractedPlan || "-"}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-[#121215] border border-zinc-800">
                    <span className="text-zinc-500 text-[11px] block">
                      Proposta
                    </span>
                    <span className="font-mono font-semibold text-zinc-100 mt-0.5 block">
                      {lookupData.customer.proposal ||
                        lookupData.customer.protocol}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-[#121215] border border-zinc-800">
                    <span className="text-zinc-500 text-[11px] block">
                      Email
                    </span>
                    <span className="font-mono font-semibold text-zinc-100 mt-0.5 block truncate">
                      {lookupData.customer.email || "-"}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-[#121215] border border-zinc-800">
                    <span className="text-zinc-500 text-[11px] block">
                      Forma De Pagamento
                    </span>
                    <span className="font-semibold text-zinc-100 mt-0.5 block">
                      {lookupData.customer.paymentMethod || "-"}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-[#121215] border border-zinc-800">
                    <span className="text-zinc-500 text-[11px] block">
                      Tipo De Fatura
                    </span>
                    <span className="font-semibold text-zinc-100 mt-0.5 block">
                      {lookupData.customer.invoiceType || "-"}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-[#121215] border border-zinc-800">
                    <span className="text-zinc-500 text-[11px] block">
                      Vencimento
                    </span>
                    <span className="font-semibold text-zinc-100 mt-0.5 block">
                      {lookupData.customer.dueDate || "-"}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-[#121215] border border-zinc-800">
                    <span className="text-zinc-500 text-[11px] block">
                      Portabilidade Antecipada
                    </span>
                    <span className="font-semibold text-zinc-100 mt-0.5 block">
                      {lookupData.customer.earlyPortability || "-"}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-[#121215] border border-zinc-800 sm:col-span-2 lg:col-span-2">
                    <span className="text-zinc-500 text-[11px] block">
                      Endereco Completo
                    </span>
                    <span className="font-semibold text-zinc-100 mt-0.5 block">
                      {lookupData.customer.fullAddress || "-"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Associated Call Recordings */}
              <div className="bg-[#0b0b0d] rounded-xl border border-zinc-800 overflow-hidden">
                <div className="p-5 border-b border-zinc-800">
                  <h3 className="text-sm font-bold text-zinc-100">
                    Gravações Vinculadas ({lookupData.recordings.length})
                  </h3>
                </div>

                <div className="divide-y divide-zinc-800">
                  {lookupData.recordings.map((call) => {
                    const isEvaluated = call.status === "AVALIADA";
                    const evalBadge = getEvaluationStatusBadge(
                      call.evaluationStatus
                    );
                    const isPlayerOpen = activeAudioCallId === call.id;

                    return (
                      <div key={call.id} className="p-5 space-y-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <span className="font-mono font-bold text-sm text-zinc-100">
                                #{call.externalCallId}
                              </span>
                              {isEvaluated ? (
                                <span
                                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs ${evalBadge.className}`}
                                >
                                  <CheckCircle2 className="h-3 w-3" />
                                  {evalBadge.label} (
                                  {Number(call.finalScorePercentage).toFixed(1)}
                                  %)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-900 text-zinc-300 border border-zinc-800">
                                  <Clock className="h-3 w-3" />
                                  Pendente
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-zinc-400">
                              Analista: <strong>{call.analyst.name}</strong> •{" "}
                              {formatDateTime(call.callDate)} • Duração:{" "}
                              <strong>
                                {formatDuration(call.durationSeconds)}
                              </strong>
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                setActiveAudioCallId(
                                  isPlayerOpen ? null : call.id
                                )
                              }
                              className="h-8 px-3 rounded-lg border border-zinc-800 bg-[#121215] hover:bg-zinc-900 text-xs font-medium text-zinc-200 transition-colors"
                            >
                              {isPlayerOpen ? "Ocultar Player" : "Ouvir Áudio"}
                            </button>

                            {isEvaluated && call.evaluationId ? (
                              <Link
                                href={`/evaluations/${call.evaluationId}`}
                                className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg border border-zinc-700 bg-zinc-900 text-xs font-semibold text-zinc-100"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                <span>Ver Avaliação</span>
                              </Link>
                            ) : (
                              <Link
                                href={`/analysts/${call.analyst.id}?callId=${call.id}`}
                                className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-xs font-semibold transition-colors"
                              >
                                <Headphones className="h-3.5 w-3.5" />
                                <span>Avaliar</span>
                              </Link>
                            )}
                          </div>
                        </div>

                        {isPlayerOpen && (
                          <CallAudioPlayer
                            audioUrl={call.audioUrl}
                            externalCallId={call.externalCallId}
                            durationSeconds={call.durationSeconds}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppShell>
  );
}
