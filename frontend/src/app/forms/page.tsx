"use client";

import React, { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { FormsManagementWorkspace } from "@/components/forms/FormsManagementWorkspace";

export default function FormsStudioPage() {
  return (
    <AppShell>
      <Suspense
        fallback={
          <div className="p-8 text-xs text-zinc-500">
            Carregando Formulários...
          </div>
        }
      >
        <FormsManagementWorkspace />
      </Suspense>
    </AppShell>
  );
}
