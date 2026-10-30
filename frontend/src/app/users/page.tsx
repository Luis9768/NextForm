"use client";

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Filter,
  Lock,
  Plus,
  Power,
  ShieldCheck,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/context/AuthContext";
import { extractErrorMessage, sectorsApi, usersApi } from "@/lib/api";
import { Role, UserSummary } from "@/types";

export default function UsersManagementPage() {
  const { isAdmin, isGestor } = useAuth();
  const queryClient = useQueryClient();

  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Novo usuário
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("Analista@123");
  const [newRole, setNewRole] = useState<Role>("ROLE_ANALISTA");
  const [newDepartment, setNewDepartment] = useState("SAC");

  // Edição de setores permitidos do Gestor (exclusivo Admin)
  const [editingManager, setEditingManager] = useState<UserSummary | null>(
    null
  );
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users-management", roleFilter, statusFilter],
    queryFn: () =>
      usersApi.list(
        roleFilter === "ALL" ? undefined : (roleFilter as Role),
        statusFilter === "ALL" ? undefined : statusFilter === "ACTIVE"
      ),
    enabled: isGestor,
  });

  const { data: sectors = [] } = useQuery({
    queryKey: ["sectors-list"],
    queryFn: () => sectorsApi.list(false),
    enabled: isGestor,
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      usersApi.toggleStatus(id, active),
    onSuccess: () => {
      setFeedbackError(null);
      queryClient.invalidateQueries({ queryKey: ["users-management"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
    onError: (err) => setFeedbackError(extractErrorMessage(err)),
  });

  const createUserMutation = useMutation({
    mutationFn: () =>
      usersApi.create({
        name: newName,
        email: newEmail,
        password: newPassword,
        role: newRole,
        department: newDepartment,
      }),
    onSuccess: () => {
      setFeedbackError(null);
      setShowCreateModal(false);
      setNewName("");
      setNewEmail("");
      queryClient.invalidateQueries({ queryKey: ["users-management"] });
    },
    onError: (err) => setFeedbackError(extractErrorMessage(err)),
  });

  const updateAllowedSectorsMutation = useMutation({
    mutationFn: ({ id, allowed }: { id: string; allowed: string[] }) =>
      usersApi.updateAllowedSectors(id, allowed),
    onSuccess: () => {
      setFeedbackError(null);
      setEditingManager(null);
      queryClient.invalidateQueries({ queryKey: ["users-management"] });
    },
    onError: (err) => setFeedbackError(extractErrorMessage(err)),
  });

  const openManagerSectorsModal = (manager: UserSummary) => {
    setEditingManager(manager);
    setSelectedSectors(manager.allowedSectors || []);
  };

  const toggleSectorInList = (sectorName: string) => {
    setSelectedSectors((prev) =>
      prev.includes(sectorName)
        ? prev.filter((s) => s !== sectorName)
        : [...prev, sectorName]
    );
  };

  const roleBadgeLabel = (r: Role) => {
    if (r === "ROLE_ADMIN") return "Administrador";
    if (r === "ROLE_GESTOR") return "Gestor";
    return "Analista";
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs font-mono mb-2">
              <Users className="h-3.5 w-3.5" />
              <span>CONTROLE DE ACESSO E COLABORADORES (RBAC)</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-100 tracking-tight">
              Gestão de Usuários
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1">
              Gerencie Administradores, Gestores e Analistas, status de
              ativação e escopo de setores liberados.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="h-9 px-4 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap self-start sm:self-auto"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Novo Colaborador</span>
          </button>
        </div>

        {feedbackError && (
          <div className="p-3 rounded-xl border border-red-900/60 bg-red-950/30 text-xs text-red-200 flex items-center justify-between">
            <span>{feedbackError}</span>
            <button
              type="button"
              onClick={() => setFeedbackError(null)}
              className="text-red-300 hover:text-white font-mono text-[11px]"
            >
              Fechar
            </button>
          </div>
        )}

        {/* Filter Bar */}
        <div className="p-4 rounded-xl border border-zinc-800/80 bg-[#0b0b0d] flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Filter className="h-3.5 w-3.5 text-zinc-500" />
              <span>Perfil de Acesso:</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { key: "ALL", label: "Todos" },
                { key: "ROLE_ADMIN", label: "Administradores" },
                { key: "ROLE_GESTOR", label: "Gestores" },
                { key: "ROLE_ANALISTA", label: "Analistas" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setRoleFilter(tab.key)}
                  className={`h-8 px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    roleFilter === tab.key
                      ? "bg-zinc-100 text-zinc-950 font-semibold"
                      : "bg-[#121215] text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">Status:</span>
            {[
              { key: "ALL", label: "Todos" },
              { key: "ACTIVE", label: "Ativos" },
              { key: "INACTIVE", label: "Inativos" },
            ].map((st) => (
              <button
                key={st.key}
                type="button"
                onClick={() => setStatusFilter(st.key)}
                className={`h-8 px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  statusFilter === st.key
                    ? "bg-zinc-100 text-zinc-950 font-semibold"
                    : "bg-[#121215] text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* Users Table */}
        <div className="rounded-xl border border-zinc-800/80 bg-[#0b0b0d] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800/80 bg-[#101013] text-[11px] font-mono uppercase text-zinc-400">
                  <th className="py-3 px-4">Colaborador</th>
                  <th className="py-3 px-4">Perfil (RBAC)</th>
                  <th className="py-3 px-4">Setor Vinculado / Escopo</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Ações de Controle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-xs">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-zinc-500">
                      Carregando usuários...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-zinc-500">
                      Nenhum usuário encontrado para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => {
                    const canToggleStatus =
                      isAdmin || u.role === "ROLE_ANALISTA";
                    return (
                      <tr
                        key={u.id}
                        className="hover:bg-zinc-900/40 transition-colors"
                      >
                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-zinc-100">
                            {u.name}
                          </p>
                          <p className="text-[11px] text-zinc-500 font-mono">
                            {u.email}
                          </p>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono border border-zinc-700 bg-zinc-900 text-zinc-200 whitespace-nowrap">
                            <ShieldCheck className="h-3 w-3 text-zinc-400" />
                            {roleBadgeLabel(u.role)}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          {u.role === "ROLE_GESTOR" ? (
                            <div className="space-y-1">
                              <span className="text-[11px] text-zinc-400 block">
                                Setores Liberados pelo Admin:
                              </span>
                              <div className="flex flex-wrap gap-1">
                                {(u.allowedSectors &&
                                u.allowedSectors.length > 0
                                  ? u.allowedSectors
                                  : ["Todos"]
                                ).map((sec) => (
                                  <span
                                    key={sec}
                                    className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-300"
                                  >
                                    {sec}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              <span className="px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-200 font-mono text-[11px]">
                                {u.department || "Geral"}
                              </span>
                              {u.managerName && (
                                <p className="text-[10px] text-zinc-500 mt-1">
                                  Gestor: {u.managerName}
                                </p>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          {u.active ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-950/50 border border-emerald-800/60 text-emerald-300 text-[11px] font-mono whitespace-nowrap">
                              <CheckCircle2 className="h-3 w-3" />
                              Ativo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-950/50 border border-red-800/60 text-red-300 text-[11px] font-mono whitespace-nowrap">
                              <XCircle className="h-3 w-3" />
                              Inativo
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center justify-end gap-2">
                            {isAdmin && u.role === "ROLE_GESTOR" && (
                              <button
                                type="button"
                                onClick={() => openManagerSectorsModal(u)}
                                className="h-8 px-2.5 rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-[11px] font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
                              >
                                <UserCheck className="h-3.5 w-3.5" />
                                <span>Definir Setores</span>
                              </button>
                            )}

                            {canToggleStatus ? (
                              <button
                                type="button"
                                onClick={() =>
                                  toggleStatusMutation.mutate({
                                    id: u.id,
                                    active: !u.active,
                                  })
                                }
                                className={`h-8 px-3 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                                  u.active
                                    ? "border-red-900/60 bg-red-950/30 hover:bg-red-950/60 text-red-200"
                                    : "border-emerald-900/60 bg-emerald-950/30 hover:bg-emerald-950/60 text-emerald-200"
                                }`}
                              >
                                <Power className="h-3.5 w-3.5" />
                                <span>{u.active ? "Inativar" : "Reativar"}</span>
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500 font-mono">
                                <Lock className="h-3 w-3" />
                                Exclusivo Admin
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal: Novo Colaborador */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#0b0b0d] p-5 space-y-4">
              <h2 className="text-base font-bold text-zinc-100">
                Cadastrar Novo Colaborador
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">
                    Nome Completo *
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Ex: Fernanda Lima"
                    className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">
                    E-mail Corporativo *
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="fernanda.lima@empresa.com"
                    className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs text-zinc-100"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">
                      Perfil de Acesso *
                    </label>
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as Role)}
                      className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs text-zinc-100"
                    >
                      <option value="ROLE_ANALISTA">Analista</option>
                      {isAdmin && <option value="ROLE_GESTOR">Gestor</option>}
                      {isAdmin && (
                        <option value="ROLE_ADMIN">Administrador</option>
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">
                      Setor Vinculado *
                    </label>
                    <select
                      value={newDepartment}
                      onChange={(e) => setNewDepartment(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs text-zinc-100"
                    >
                      {sectors.map((s) => (
                        <option key={s.id} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">
                    Senha Inicial *
                  </label>
                  <input
                    type="text"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#121215] text-xs font-mono text-zinc-100"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="h-9 px-4 rounded-lg border border-zinc-800 text-xs text-zinc-300"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!newName || !newEmail || createUserMutation.isPending}
                  onClick={() => createUserMutation.mutate()}
                  className="h-9 px-4 rounded-lg bg-zinc-100 text-zinc-950 text-xs font-semibold disabled:opacity-50"
                >
                  Salvar Colaborador
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Admin: Definir Setores Liberados para Gestor */}
        {editingManager && (
          <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#0b0b0d] p-5 space-y-4">
              <div>
                <h2 className="text-base font-bold text-zinc-100">
                  Setores Autorizados — {editingManager.name}
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Selecione quais setores este Gestor poderá visualizar,
                  gerenciar e avaliar.
                </p>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {sectors.map((sec) => {
                  const checked = selectedSectors.includes(sec.name);
                  return (
                    <label
                      key={sec.id}
                      className="flex items-center justify-between p-2.5 rounded-lg border border-zinc-800 bg-[#121215] cursor-pointer"
                    >
                      <span className="text-xs font-medium text-zinc-200">
                        {sec.name}
                      </span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSectorInList(sec.name)}
                        className="h-4 w-4 accent-zinc-100"
                      />
                    </label>
                  );
                })}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingManager(null)}
                  className="h-9 px-4 rounded-lg border border-zinc-800 text-xs text-zinc-300"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateAllowedSectorsMutation.mutate({
                      id: editingManager.id,
                      allowed: selectedSectors,
                    })
                  }
                  className="h-9 px-4 rounded-lg bg-zinc-100 text-zinc-950 text-xs font-semibold"
                >
                  Salvar Permissões de Setor
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
