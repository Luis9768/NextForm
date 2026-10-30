"use client";

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Edit3,
  FolderKanban,
  Lock,
  Plus,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/context/AuthContext";
import { extractErrorMessage, sectorsApi } from "@/lib/api";
import { SectorItem } from "@/types";

export default function SectorsManagementPage() {
  const { isAdmin, isGestor } = useAuth();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [editingSector, setEditingSector] = useState<SectorItem | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: sectors = [], isLoading } = useQuery({
    queryKey: ["sectors-list"],
    queryFn: () => sectorsApi.list(false),
    enabled: isGestor,
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      if (editingSector) {
        return sectorsApi.update(editingSector.id, {
          name,
          code,
          description,
          active: editingSector.active,
        });
      }
      return sectorsApi.create({ name, code, description, active: true });
    },
    onSuccess: () => {
      setErrorMsg(null);
      setEditingSector(null);
      setName("");
      setCode("");
      setDescription("");
      queryClient.invalidateQueries({ queryKey: ["sectors-list"] });
    },
    onError: (err) => setErrorMsg(extractErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => sectorsApi.remove(id),
    onSuccess: () => {
      setErrorMsg(null);
      queryClient.invalidateQueries({ queryKey: ["sectors-list"] });
    },
    onError: (err) => setErrorMsg(extractErrorMessage(err)),
  });

  const startEdit = (sec: SectorItem) => {
    setEditingSector(sec);
    setName(sec.name);
    setCode(sec.code);
    setDescription(sec.description || "");
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs font-mono mb-2">
              <FolderKanban className="h-3.5 w-3.5" />
              <span>ESTRUTURA ORGANIZACIONAL & SETORES</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-100 tracking-tight">
              Gestão de Setores
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1">
              {isAdmin
                ? "Cadastre, renomeie ou exclua setores operacionais da empresa (acesso exclusivo de Administrador)."
                : "Visualização dos setores atribuídos ao seu perfil de Gestor pelo Administrador."}
            </p>
          </div>

          {!isAdmin && (
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs text-zinc-400">
              <Lock className="h-3.5 w-3.5 text-zinc-500" />
              <span>Somente o Administrador pode criar ou editar setores</span>
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl border border-red-900/60 bg-red-950/30 text-xs text-red-200">
            {errorMsg}
          </div>
        )}

        {/* Admin Form to Create / Edit Sector */}
        {isAdmin && (
          <div className="p-4 sm:p-5 rounded-xl border border-zinc-800/80 bg-[#0b0b0d] space-y-4">
            <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
              {editingSector
                ? `Editando Setor: ${editingSector.name}`
                : "Cadastrar Novo Setor (Exclusivo Admin)"}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-4">
                <label className="block text-xs text-zinc-400 mb-1">
                  Nome do Setor *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Aquisição, Retenção, SAC..."
                  className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs text-zinc-100"
                />
              </div>
              <div className="md:col-span-3">
                <label className="block text-xs text-zinc-400 mb-1">
                  Código Identificador
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Ex: AQUISICAO"
                  className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs font-mono text-zinc-100"
                />
              </div>
              <div className="md:col-span-5">
                <label className="block text-xs text-zinc-400 mb-1">
                  Descrição Operacional
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Escopo de atendimento e auditoria do setor..."
                  className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs text-zinc-100"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              {editingSector && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingSector(null);
                    setName("");
                    setCode("");
                    setDescription("");
                  }}
                  className="h-9 px-4 rounded-lg border border-zinc-800 text-xs text-zinc-300"
                >
                  Cancelar Edição
                </button>
              )}
              <button
                type="button"
                disabled={!name.trim() || saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
                className="h-9 px-4 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>
                  {editingSector ? "Salvar Alterações" : "Criar Setor"}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Sectors Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {isLoading ? (
            <div className="col-span-full py-12 text-center text-xs text-zinc-500">
              Carregando setores...
            </div>
          ) : (
            sectors.map((sec) => (
              <div
                key={sec.id}
                className="p-5 rounded-xl border border-zinc-800/80 bg-[#0b0b0d] flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-400">
                      {sec.code}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" />
                      Ativo
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-zinc-100">
                    {sec.name}
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    {sec.description ||
                      "Setor operacional vinculado às matrizes padronizadas de monitoria."}
                  </p>
                </div>

                {isAdmin && (
                  <div className="pt-3 border-t border-zinc-800/70 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(sec)}
                      className="h-8 px-3 rounded-lg border border-zinc-800 bg-[#121215] hover:bg-zinc-900 text-xs text-zinc-200 inline-flex items-center gap-1.5"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>Renomear / Editar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate(sec.id)}
                      className="h-8 px-3 rounded-lg border border-red-900/60 bg-red-950/30 hover:bg-red-950/60 text-xs text-red-200 inline-flex items-center gap-1.5"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Excluir</span>
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
