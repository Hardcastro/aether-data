import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { MARCA } from "@/site.config";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(MARCA.url),
  title: `${MARCA.nome} — ${MARCA.promessa}`,
  description: MARCA.descricao,
  openGraph: {
    type: "website",
    locale: MARCA.locale,
    siteName: MARCA.nome,
    title: MARCA.nome,
    description: MARCA.descricao,
    url: MARCA.url,
  },
  twitter: {
    card: "summary",
    title: MARCA.nome,
    description: MARCA.descricao,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const temContato = Boolean(MARCA.email || MARCA.whatsapp);

  return (
    <html lang="pt-BR" className={`${inter.variable} h-full antialiased`}>
      <body className="relative flex min-h-full flex-col font-sans">
        <a
          href="#conteudo"
          className="skip-link rounded-control bg-clay-primary px-4 py-2 text-body-sm font-medium text-clay-primary-ink shadow-clay"
        >
          Pular para o conteúdo
        </a>
        <main id="conteudo" className="flex-1">
          {children}
        </main>
        {temContato && (
          <footer className="border-t border-glass-solid-border px-6 py-4 text-body-sm text-text-muted">
            {MARCA.whatsapp && <a href={`https://wa.me/${MARCA.whatsapp}`}>WhatsApp</a>}
            {MARCA.email && <a href={`mailto:${MARCA.email}`}>{MARCA.email}</a>}
          </footer>
        )}
      </body>
    </html>
  );
}
