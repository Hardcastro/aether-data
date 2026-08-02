import type { Metadata } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import { MARCA } from "@/site.config";
import { Cabecalho } from "@/components/Cabecalho";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

/**
 * Display da peça. A referência usava Galada, que só traz latim básico e
 * quebraria em "cardápio", "competência" e "próximo". Instrument Serif tem o
 * mesmo peso editorial com o latim estendido completo.
 */
const instrument = Instrument_Serif({
  variable: "--font-instrument",
  // Só "latin": todo acento do português (á ã ç é ê í ó õ ú) vive em Basic
  // Latin + Latin-1 Supplement. "latin-ext" cobre o leste europeu, não faz
  // falta aqui — e next/font derruba o BUILD, não o runtime, se a fonte não
  // publicar o subconjunto pedido. Pedir a menos é grátis; pedir a mais não.
  subsets: ["latin"],
  weight: "400",
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
  return (
    <html lang="pt-BR" className={`${inter.variable} ${instrument.variable}`}>
      <body>
        <a href="#conteudo" className="skip-link">
          Pular para o conteúdo
        </a>
        {/*
          O cabeçalho é server component porque lê MARCA, que carrega
          VERCEL_PROJECT_PRODUCTION_URL. Se ele virasse client, a variável não
          existiria no bundle e os links de contato sumiriam sem erro de build.
        */}
        <Cabecalho email={MARCA.email} whatsapp={MARCA.whatsapp} />
        {children}
      </body>
    </html>
  );
}
