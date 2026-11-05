"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Play,
  Plus,
  Power,
  Terminal,
  Webhook,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/context/AuthContext";
import {
  API_BASE_URL,
  extractErrorMessage,
  n8nWebhookApi,
  studioApi,
} from "@/lib/api";
import { CallRecord } from "@/types";

export default function N8nIntegrationPage() {
  const { isGestor } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<
    "outbound_webhooks" | "inbound_n8n"
  >("outbound_webhooks");

  // Outbound Webhooks state
  const [whName, setWhName] = useState("");
  const [whUrl, setWhUrl] = useState(
    "https://n8n.empresa.com/webhook/nexform-event"
  );
  const [whCollection, setWhCollection] = useState("evaluations");
  const [whAction, setWhAction] = useState("create");

  // Inbound n8n Simulator state
  const [apiKey, setApiKey] = useState("n8n-secret-api-key-2026");
  const [externalCallId, setExternalCallId] = useState(
    () => `call_${Math.floor(100000 + Math.random() * 900000)}`
  );
  const [analystEmail, setAnalystEmail] = useState("analista@empresa.com");
  const [customerIdentifier, setCustomerIdentifier] =
    useState("+5511999999999");
  const [durationSeconds, setDurationSeconds] = useState(185);
  const [audioUrl, setAudioUrl] = useState(
    "https://storage.empresa.com/audios/call_123456.mp3"
  );
  const [channel, setChannel] = useState("telefonia");
  const [campaign, setCampaign] = useState("cobranca");

  const [createdCall, setCreatedCall] = useState<CallRecord | null>(null);
  const [webhookError, setWebhookError] = useState<string | null>(null);

  const { data: webhooks = [] } = useQuery({
    queryKey: ["studio-webhooks"],
    queryFn: studioApi.listWebhooks,
    enabled: isGestor,
  });

  const createWebhookMutation = useMutation({
    mutationFn: () =>
      studioApi.createWebhook({
        name: whName.trim() || "Webhook de Integração QA",
        url: whUrl.trim(),
        collection: whCollection,
        action: whAction,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studio-webhooks"] });
      setWhName("");
    },
  });

  const toggleWebhookMutation = useMutation({
    mutationFn: (id: string) => studioApi.toggleWebhook(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studio-webhooks"] });
    },
  });

  const sendWebhookMutation = useMutation({
    mutationFn: async () => {
      setWebhookError(null);
      setCreatedCall(null);
      return n8nWebhookApi.sendCall(
        {
          externalCallId,
          analystEmail,
          customerIdentifier,
          callDate: new Date().toISOString(),
          durationSeconds: Number(durationSeconds),
          audioUrl,
          metadata: {
            channel,
            campaign,
          },
        },
        apiKey
      );
    },
    onSuccess: (res) => {
      setCreatedCall(res);
      queryClient.invalidateQueries({ queryKey: ["calls-list"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      setExternalCallId(`call_${Math.floor(100000 + Math.random() * 900000)}`);
    },
    onError: (err) => {
      setWebhookError(extractErrorMessage(err));
    },
  });

  if (!isGestor) {
    return (
      <AppShell>
        <div className="p-6 rounded-xl bg-[#101013] border border-zinc-800 text-zinc-300 text-sm">
          Acesso restrito ao perfil <strong>ROLE_GESTOR</strong>.
        </div>
      </AppShell>
    );
  }

  const sampleJson = JSON.stringify(
    {
      externalCallId: "call_123456",
      analystEmail: "analista@empresa.com",
      customerIdentifier: "+5511999999999",
      callDate: "2026-03-30T14:30:00Z",
      durationSeconds: 185,
      audioUrl: "https://storage.empresa.com/audios/call_123456.mp3",
      metadata: {
        channel: "telefonia",
        campaign: "cobranca",
      },
    },
    null,
    2
  );

  return (
    <AppShell>
      <div className="space-y-6 pb-16">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            Webhooks & Integrações
          </h1>

          <div className="inline-flex items-center gap-1 rounded-lg bg-[#09090b] p-1 border border-zinc-800 self-start">
            <button
              type="button"
              onClick={() => setActiveTab("outbound_webhooks")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === "outbound_webhooks"
                  ? "bg-zinc-100 text-zinc-950 font-semibold"
                  : "text-zinc-400 hover:text-zinc-100"
              }`}
            >
              Webhooks de Saída ({webhooks.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("inbound_n8n")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === "inbound_n8n"
                  ? "bg-zinc-100 text-zinc-950 font-semibold"
                  : "text-zinc-400 hover:text-zinc-100"
              }`}
            >
              Simulador Inbound n8n
            </button>
          </div>
        </div>

        {activeTab === "outbound_webhooks" ? (
          <div className="space-y-6">
            {/* Create Outbound Webhook Form */}
            <div className="rounded-xl border border-zinc-800 bg-[#101013] p-5 space-y-4">
              <h2 className="text-sm font-semibold text-zinc-100">
                Registrar Novo Webhook de Saída (directus_webhooks)
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-3">
                  <label className="block text-xs text-zinc-400 mb-1">
                    Nome da Integração
                  </label>
                  <input
                    type="text"
                    value={whName}
                    onChange={(e) => setWhName(e.target.value)}
                    placeholder="Ex: Notificar Canal QA"
                    className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs text-zinc-100"
                  />
                </div>
                <div className="md:col-span-4">
                  <label className="block text-xs text-zinc-400 mb-1">
                    URL de Destino (POST)
                  </label>
                  <input
                    type="text"
                    value={whUrl}
                    onChange={(e) => setWhUrl(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs font-mono text-zinc-200"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-zinc-400 mb-1">
                    Coleção
                  </label>
                  <select
                    value={whCollection}
                    onChange={(e) => setWhCollection(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs font-mono text-zinc-200"
                  >
                    <option value="evaluations">evaluations</option>
                    <option value="call_records">call_records</option>
                    <option value="evaluation_form_templates">
                      form_templates
                    </option>
                  </select>
                </div>
                <div className="md:col-span-1">
                  <label className="block text-xs text-zinc-400 mb-1">
                    Ação
                  </label>
                  <select
                    value={whAction}
                    onChange={(e) => setWhAction(e.target.value)}
                    className="w-full h-9 px-2 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs font-mono text-zinc-200"
                  >
                    <option value="create">create</option>
                    <option value="update">update</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <button
                    type="button"
                    onClick={() => createWebhookMutation.mutate()}
                    disabled={createWebhookMutation.isPending}
                    className="w-full h-9 rounded-lg bg-zinc-100 text-zinc-950 font-semibold text-xs inline-flex items-center justify-center gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Adicionar</span>
                  </button>
                </div>
              </div>
            </div>

            {/* List of Outbound Webhooks */}
            <div className="rounded-xl border border-zinc-800 bg-[#101013] divide-y divide-zinc-800/80 overflow-hidden">
              {webhooks.map((wh) => {
                const active = wh.status === "ACTIVE";
                return (
                  <div
                    key={wh.id}
                    className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            active
                              ? "bg-zinc-100 text-zinc-950"
                              : "bg-zinc-900 text-zinc-500 border border-zinc-800"
                          }`}
                        >
                          {wh.status}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-300">
                          {wh.method}
                        </span>
                        <span className="text-sm font-semibold text-zinc-100">
                          {wh.name}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-zinc-400">
                        {wh.url}
                      </p>
                      <p className="text-[11px] font-mono text-zinc-500">
                        Gatilhos: {wh.collections.join(", ")} (
                        {wh.actions.join(", ")}) • Disparo(s):{" "}
                        {wh.deliveriesCount} • Último retorno:{" "}
                        <strong className="text-emerald-400">
                          {wh.lastHttpStatus}
                        </strong>
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleWebhookMutation.mutate(wh.id)}
                      className="h-8 px-3 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-300 inline-flex items-center gap-1.5 self-start md:self-center"
                    >
                      <Power className="h-3.5 w-3.5" />
                      <span>{active ? "Inativar" : "Ativar"}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Left: Interactive Webhook Simulator */}
            <div className="rounded-xl border border-zinc-800 bg-[#101013] p-6 space-y-5">
              <div className="flex items-center gap-2.5 border-b border-zinc-800 pb-4">
                <Webhook className="h-5 w-5 text-zinc-300" />
                <div>
                  <h2 className="text-sm font-bold text-zinc-100">
                    Simulador de Disparo do Agente n8n
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Envia uma requisição real para{" "}
                    <code className="font-mono">
                      POST /api/v1/integrations/n8n/calls
                    </code>
                  </p>
                </div>
              </div>

              {webhookError && (
                <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-900 flex items-start gap-2.5 text-red-200 text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{webhookError}</span>
                </div>
              )}

              {createdCall && (
                <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-700 space-y-2">
                  <div className="flex items-center gap-2 text-zinc-100 text-xs font-bold">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span>
                      Ligação #{createdCall.externalCallId} ingerida com
                      sucesso!
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400">
                    Associada ao analista{" "}
                    <strong>{createdCall.analyst.name}</strong> (
                    {createdCall.analyst.email}) com status{" "}
                    <strong>PENDENTE</strong>.
                  </p>
                  <div className="pt-1">
                    <Link
                      href={`/calls/${createdCall.id}/evaluate`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 text-zinc-950 text-xs font-bold"
                    >
                      <span>Avaliar Esta Ligação Agora</span>
                    </Link>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-300 mb-1">
                    <KeyRound className="h-3.5 w-3.5 text-zinc-400" />
                    <span>Header X-API-KEY</span>
                  </label>
                  <input
                    type="text"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-zinc-800 font-mono text-xs bg-[#0b0b0d] text-zinc-100"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">
                      externalCallId
                    </label>
                    <input
                      type="text"
                      value={externalCallId}
                      onChange={(e) => setExternalCallId(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-zinc-800 text-xs font-mono bg-[#0b0b0d] text-zinc-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">
                      analystEmail
                    </label>
                    <select
                      value={analystEmail}
                      onChange={(e) => setAnalystEmail(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-zinc-800 text-xs bg-[#0b0b0d] text-zinc-100"
                    >
                      <option value="analista@empresa.com">
                        analista@empresa.com (Lucas Ferreira)
                      </option>
                      <option value="mariana.costa@empresa.com">
                        mariana.costa@empresa.com (Mariana Costa)
                      </option>
                      <option value="rafael.souza@empresa.com">
                        rafael.souza@empresa.com (Rafael Souza)
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">
                      customerIdentifier
                    </label>
                    <input
                      type="text"
                      value={customerIdentifier}
                      onChange={(e) => setCustomerIdentifier(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-zinc-800 text-xs bg-[#0b0b0d] text-zinc-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">
                      durationSeconds
                    </label>
                    <input
                      type="number"
                      value={durationSeconds}
                      onChange={(e) =>
                        setDurationSeconds(Number(e.target.value))
                      }
                      className="w-full h-9 px-3 rounded-lg border border-zinc-800 text-xs bg-[#0b0b0d] text-zinc-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">
                      metadata.channel
                    </label>
                    <input
                      type="text"
                      value={channel}
                      onChange={(e) => setChannel(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-zinc-800 text-xs bg-[#0b0b0d] text-zinc-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">
                      metadata.campaign
                    </label>
                    <input
                      type="text"
                      value={campaign}
                      onChange={(e) => setCampaign(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-zinc-800 text-xs bg-[#0b0b0d] text-zinc-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-zinc-400 mb-1">
                    audioUrl
                  </label>
                  <input
                    type="text"
                    value={audioUrl}
                    onChange={(e) => setAudioUrl(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-zinc-800 text-xs font-mono bg-[#0b0b0d] text-zinc-100"
                  />
                </div>

                <button
                  type="button"
                  disabled={sendWebhookMutation.isPending}
                  onClick={() => sendWebhookMutation.mutate()}
                  className="w-full h-10 px-4 rounded-lg bg-zinc-100 hover:bg-zinc-200 disabled:opacity-50 text-zinc-950 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <Play className="h-4 w-4 fill-current" />
                  <span>
                    {sendWebhookMutation.isPending
                      ? "Enviando Payload..."
                      : "Disparar Webhook POST /api/v1/integrations/n8n/calls"}
                  </span>
                </button>
              </div>
            </div>

            {/* Right: Specification & cURL */}
            <div className="bg-[#101013] text-zinc-100 rounded-xl p-6 space-y-4 border border-zinc-800">
              <div className="flex items-center gap-2 text-zinc-300 text-xs font-mono uppercase tracking-wider">
                <Terminal className="h-4 w-4" />
                <span>Especificação do Endpoint para o n8n</span>
              </div>

              <div className="space-y-2 text-xs">
                <p className="text-zinc-400">
                  <strong className="text-zinc-200">Método & URL:</strong>{" "}
                  <code className="text-zinc-100 font-mono">
                    POST {API_BASE_URL}/integrations/n8n/calls
                  </code>
                </p>
                <p className="text-zinc-400">
                  <strong className="text-zinc-200">Header:</strong>{" "}
                  <code className="text-zinc-100 font-mono">
                    X-API-KEY: n8n-secret-api-key-2026
                  </code>
                </p>
              </div>

              <div>
                <p className="text-xs font-medium text-zinc-400 mb-1.5">
                  Payload JSON Esperado:
                </p>
                <pre className="p-4 rounded-lg bg-[#0b0b0d] border border-zinc-800 text-[11px] font-mono text-zinc-200 overflow-x-auto">
                  {sampleJson}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
