import type { MetadataRoute } from "next";
import { MARCA } from "@/site.config";

/**
 * O site não tinha /robots.txt nenhum. Sem ele nada é bloqueado — o buscador
 * entra do mesmo jeito — mas o sitemap deixa de ser anunciado, e quem descobre
 * as peças passa a depender de o robô tropeçar nos links. O sitemap.ts existe
 * desde 03/08 e ninguém tinha sido avisado dele.
 *
 * As rotas de API ficam de fora do rastreio: `/api/monitor/*` responde a
 * assinatura e cancelamento, `/api/cron/monitor` é o agendador e
 * `/api/transcrever` gasta chave de modelo por chamada. Nenhuma delas tem
 * conteúdo para indexar, e a última tem custo por acesso.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/api/",
    },
    sitemap: `${MARCA.url}/sitemap.xml`,
  };
}
