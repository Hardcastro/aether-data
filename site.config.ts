/**
 * Nunca importar este módulo de um arquivo "use client" (nem de nada que um
 * client component importe). VERCEL_PROJECT_PRODUCTION_URL não existe no
 * bundle do cliente — se MARCA vazar para lá, `url` vira localhost:3000 em
 * produção sem erro nenhum no build. Ver seção 5 e 10 do prompt-claude-code-04.
 */
export const MARCA = {
  nome: "AEther Data",
  promessa: "Puxo dado de onde ele está e devolvo funcionando.",
  descricao:
    "Portfólio de automação de rotina com dado e sites que exibem esse dado — três peças no ar, agrupadas pela competência que carregam.",
  url: process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000",
  // Ainda não existem — regra do vazio: campo nulo não desenha o link.
  email: null as string | null,
  whatsapp: null as string | null,
  locale: "pt_BR",
} as const;
