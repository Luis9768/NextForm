import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "NEXFORM | Gestão de Qualidade, Pessoas & Auditoria de Ligações",
  description:
    "Plataforma corporativa NEXFORM para Monitoria de Qualidade, Desenvolvimento de Equipes (RH/QA), Formulários Dinâmicos e Auditoria de Atendimento.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
