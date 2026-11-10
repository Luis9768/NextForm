"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogOut,
} from "lucide-react";
import { NexformLogo } from "@/components/brand/NexformLogo";
import { useAuth } from "@/context/AuthContext";
import { authApi, extractErrorMessage } from "@/lib/api";

export default function FirstAccessPasswordPage() {
  const { user, updateCurrentUser, logout } = useAuth();
  const router = useRouter();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.trim().length < 6) {
      setError("A nova senha deve ter no mínimo 6 caracteres.");
      return;
    }
    if (newPassword.trim() !== confirmPassword.trim()) {
      setError("A confirmação de senha não confere com a senha digitada.");
      return;
    }

    setIsSaving(true);
    try {
      const updatedUser = await authApi.changeOwnPassword({
        newPassword: newPassword.trim(),
        confirmPassword: confirmPassword.trim(),
      });
      updateCurrentUser(updatedUser);
      router.replace("/dashboard");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-[#050506] text-zinc-100 p-3 sm:p-6 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-md rounded-2xl border border-zinc-800/90 bg-[#0b0b0d] p-6 sm:p-7 space-y-5 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
          <NexformLogo size="sm" />
          <button
            type="button"
            onClick={logout}
            className="h-8 px-2.5 rounded-md border border-zinc-800 bg-[#121215] hover:bg-zinc-800 text-xs text-zinc-400 hover:text-zinc-100 inline-flex items-center gap-1.5 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sair</span>
          </button>
        </div>

        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-zinc-300">
            <KeyRound className="h-3 w-3 text-zinc-400" />
            <span>Primeiro Acesso • Troca Obrigatória</span>
          </div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-50">
            Defina sua Nova Senha
          </h1>
          {user && (
            <p className="text-xs text-zinc-400 font-mono truncate">
              {user.name} ({user.email})
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {error && (
            <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-900/70 flex items-start gap-2 text-red-200 text-xs">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-300">
              Senha *
            </label>
            <div className="relative">
              <Lock className="h-4 w-4 text-zinc-500 absolute left-3.5 top-2.5" />
              <input
                type={showNewPassword ? "text" : "password"}
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Digite sua nova senha pessoal..."
                className="w-full h-9 pl-10 pr-9 bg-[#121215] border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
              />
              <button
                type="button"
                tabIndex={-1}
                aria-label={showNewPassword ? "Ocultar senha" : "Ver senha"}
                onClick={() => setShowNewPassword((v) => !v)}
                className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                {showNewPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-300">
              Confirmar Senha *
            </label>
            <div className="relative">
              <CheckCircle2 className="h-4 w-4 text-zinc-500 absolute left-3.5 top-2.5" />
              <input
                type={showConfirmPassword ? "text" : "password"}
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha..."
                className="w-full h-9 pl-10 pr-9 bg-[#121215] border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
              />
              <button
                type="button"
                tabIndex={-1}
                aria-label={
                  showConfirmPassword
                    ? "Ocultar confirmação de senha"
                    : "Ver confirmação de senha"
                }
                onClick={() => setShowConfirmPassword((v) => !v)}
                className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full h-9 px-4 rounded-lg bg-zinc-100 hover:bg-zinc-200 active:scale-[0.98] disabled:opacity-50 text-zinc-950 font-semibold text-xs flex items-center justify-center gap-2 transition-all"
          >
            <span>
              {isSaving ? "Salvando senha..." : "Salvar Senha e Entrar"}
            </span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </form>
      </motion.div>
    </div>
  );
}
