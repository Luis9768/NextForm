"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function HomePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (user) {
        router.replace("/dashboard");
      } else {
        router.replace("/login");
      }
    }
  }, [user, isLoading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050506]">
      <div className="flex items-center gap-3 text-zinc-400 text-xs font-mono">
        <div className="h-4 w-4 rounded-full border-2 border-zinc-200 border-t-transparent animate-spin" />
        Inicializando NEXFORM...
      </div>
    </div>
  );
}
