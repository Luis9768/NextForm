"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  Lock,
  Mail,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { NexformLogo } from "@/components/brand/NexformLogo";
import { useAuth } from "@/context/AuthContext";
import { extractErrorMessage } from "@/lib/api";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("gestor@empresa.com");
  const [password, setPassword] = useState("Gestor@123");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const quickLogin = async (demoEmail: string, demoPassword: string) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setError(null);
    setIsSubmitting(true);
    try {
      await login(demoEmail, demoPassword);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-[#050506] text-zinc-100 p-0 sm:p-2.5 flex">
      <div className="h-full w-full rounded-none sm:rounded-2xl border-0 sm:border border-zinc-800/80 bg-[#0b0b0d] grid grid-cols-1 md:grid-cols-12 overflow-hidden">
        {/* ====================================================================
            LEFT COLUMN: LOCKED FULL-HEIGHT LOGIN FORM (ZERO SCROLL)
           ==================================================================== */}
        <div className="h-full md:col-span-6 lg:col-span-5 flex flex-col justify-between px-6 py-4 sm:px-8 sm:py-6 border-b md:border-b-0 md:border-r border-zinc-800/80 overflow-hidden">
          {/* Top Brand Bar */}
          <div className="shrink-0">
            <NexformLogo size="sm" />
          </div>

          {/* Center Login Form */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-sm mx-auto space-y-4 my-auto"
          >
            <div className="space-y-1">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-50">
                Bem-vindo ao NEXFORM
              </h1>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Acesse o ecossistema de organização de formulários, auditoria de
                atendimento e evolução de equipes.
              </p>
            </div>

            <form className="space-y-3" onSubmit={handleSubmit}>
              {error && (
                <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-900/70 flex items-start gap-2 text-red-200 text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-xs font-medium text-zinc-300">
                  E-mail corporativo
                </label>
                <div className="relative">
                  <Mail className="h-4 w-4 text-zinc-500 absolute left-3.5 top-2.5" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-9 pl-10 pr-4 bg-[#121215] border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                    placeholder="voce@empresa.com"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-zinc-300">
                  Senha
                </label>
                <div className="relative">
                  <Lock className="h-4 w-4 text-zinc-500 absolute left-3.5 top-2.5" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full h-9 pl-10 pr-4 bg-[#121215] border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-9 px-4 rounded-lg bg-zinc-100 hover:bg-zinc-200 active:scale-[0.98] disabled:opacity-50 text-zinc-950 font-semibold text-xs flex items-center justify-center gap-2 transition-all"
              >
                <span>
                  {isSubmitting ? "Autenticando..." : "Entrar no NEXFORM"}
                </span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </form>

            {/* Quick RBAC Demo Switcher */}
            <div className="pt-3.5 border-t border-zinc-800/80 space-y-2">
              <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 block">
                Acesso Rápido de Demonstração
              </span>

              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => quickLogin("admin@empresa.com", "Admin@123")}
                  className="w-full p-2 rounded-lg bg-[#121215] hover:bg-zinc-900 border border-zinc-800/90 hover:border-zinc-700 text-left transition-all flex items-center justify-between gap-3 group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-6 w-6 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-100 flex items-center justify-center shrink-0">
                      <ShieldCheck className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-zinc-100 group-hover:text-white truncate leading-tight">
                        Entrar como Administrador (Admin)
                      </p>
                      <p className="text-[10px] text-zinc-500 font-mono truncate leading-tight mt-0.5">
                        admin@empresa.com • Controle de Setores & RBAC
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-zinc-500 group-hover:text-zinc-200 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => quickLogin("gestor@empresa.com", "Gestor@123")}
                  className="w-full p-2 rounded-lg bg-[#121215] hover:bg-zinc-900 border border-zinc-800/90 hover:border-zinc-700 text-left transition-all flex items-center justify-between gap-3 group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-6 w-6 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-200 flex items-center justify-center shrink-0">
                      <ShieldCheck className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-zinc-100 group-hover:text-white truncate leading-tight">
                        Entrar como Gestora
                      </p>
                      <p className="text-[10px] text-zinc-500 font-mono truncate leading-tight mt-0.5">
                        gestor@empresa.com • Escopo por Setores Liberados
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-zinc-500 group-hover:text-zinc-200 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    quickLogin("analista@empresa.com", "Analista@123")
                  }
                  className="w-full p-2 rounded-lg bg-[#121215] hover:bg-zinc-900 border border-zinc-800/90 hover:border-zinc-700 text-left transition-all flex items-center justify-between gap-3 group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-6 w-6 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300 flex items-center justify-center shrink-0">
                      <UserCheck className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-zinc-100 group-hover:text-white truncate leading-tight">
                        Entrar como Analista
                      </p>
                      <p className="text-[10px] text-zinc-500 font-mono truncate leading-tight mt-0.5">
                        analista@empresa.com • Visão Pessoal Restrita
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-zinc-500 group-hover:text-zinc-200 shrink-0" />
                </button>
              </div>
            </div>
          </motion.div>

          {/* Footer Meta */}
          <div className="text-[11px] text-zinc-500 font-mono shrink-0">
            <span>NEXFORM</span>
          </div>
        </div>

        {/* ====================================================================
            RIGHT COLUMN: CLEAN VISUAL IMAGE OF PEOPLE, ORGANIZATION & TECH
           ==================================================================== */}
        <div className="hidden md:flex h-full md:col-span-6 lg:col-span-7 relative bg-[#070709] overflow-hidden flex-col justify-end">
          {/* Full-Bleed Corporate Team, Organization & Tech Photography */}
          <img
            src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1600&q=85"
            alt="Equipe em ambiente tecnológico de gestão de pessoas e processos"
            className="absolute inset-0 w-full h-full object-cover object-center grayscale contrast-110 brightness-[0.6] select-none pointer-events-none"
          />

          {/* Editorial Dark Gradient Overlay */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "linear-gradient(180deg, rgba(7,7,9,0.2) 0%, rgba(7,7,9,0.35) 55%, rgba(7,7,9,0.92) 100%)",
            }}
          />

          {/* Bottom Clean Editorial Caption (Zero Pills/Balloons) */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1 }}
            className="relative z-10 p-8 lg:p-10 space-y-2.5 max-w-2xl"
          >
            <h2 className="text-2xl lg:text-3xl font-bold tracking-tight text-white leading-tight">
              Tecnologia e organização conectadas ao desenvolvimento de pessoas.
            </h2>

            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed max-w-xl">
              Transforme cada atendimento em evolução real da equipe com
              formulários personalizados, pesos dinâmicos por critério e
              histórico estruturado de performance.
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
