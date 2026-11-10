"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { UserSummary } from "@/types";
import { authApi } from "@/lib/api";

interface AuthContextValue {
  user: UserSummary | null;
  token: string | null;
  isLoading: boolean;
  isAdmin: boolean;
  isGestor: boolean;
  isAnalista: boolean;
  login: (email: string, password: string) => Promise<void>;
  updateCurrentUser: (updated: UserSummary) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSummary | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const savedToken = localStorage.getItem("formshq_token");
    const savedUser = localStorage.getItem("formshq_user");

    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem("formshq_token");
        localStorage.removeItem("formshq_user");
      }
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!isLoading) {
      if (!user && pathname !== "/login") {
        router.replace("/login");
      } else if (user && user.mustChangePassword && pathname !== "/first-access") {
        router.replace("/first-access");
      }
    }
  }, [isLoading, user, pathname, router]);

  const login = async (email: string, password: string) => {
    const response = await authApi.login(email, password);
    localStorage.setItem("formshq_token", response.accessToken);
    localStorage.setItem("formshq_user", JSON.stringify(response.user));
    setToken(response.accessToken);
    setUser(response.user);

    if (response.user.mustChangePassword) {
      router.push("/first-access");
    } else if (response.user.role === "ROLE_ANALISTA") {
      router.push("/dashboard");
    } else {
      router.push("/dashboard");
    }
  };

  const updateCurrentUser = (updated: UserSummary) => {
    localStorage.setItem("formshq_user", JSON.stringify(updated));
    setUser(updated);
  };

  const logout = () => {
    localStorage.removeItem("formshq_token");
    localStorage.removeItem("formshq_user");
    setToken(null);
    setUser(null);
    router.replace("/login");
  };

  const isAdmin = user?.role === "ROLE_ADMIN";
  const isGestor = user?.role === "ROLE_GESTOR" || user?.role === "ROLE_ADMIN";
  const isAnalista = user?.role === "ROLE_ANALISTA";

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAdmin,
        isGestor,
        isAnalista,
        login,
        updateCurrentUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth deve ser utilizado dentro de um AuthProvider");
  }
  return ctx;
}
