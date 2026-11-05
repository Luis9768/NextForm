"use client";

import React, { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { FormsManagementWorkspace } from "@/components/forms/FormsManagementWorkspace";

export default function NewFormPage() {
  return (
    <AppShell>
      <Suspense
        fallback={
          <div className="p-8 text-xs text-zinc-500">
            Carregando Novo Formulário...
          </div>
        }
      >
        <FormsManagementWorkspace defaultCreateNew={true} />
      </Suspense>
    </AppShell>
  );
}
