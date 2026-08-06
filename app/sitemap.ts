import type { MetadataRoute } from "next";
import { MARCA } from "@/site.config";
import { PECAS } from "@/lib/manifesto";

/**
 * S1, S3 e a peça 05 já tinham sitemap.ts — o hub não tinha nenhum (SEO,
 * 03/08). Aqui não existem rotas de verdade por peça, só a home em variações
 * de ?peca=slug — mas cada uma já ganha title/description/og:image próprios
 * via generateMetadata em page.tsx, então cada uma é uma página indexável de
 * verdade e merece entrada própria aqui, não só a home nua.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: MARCA.url,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    ...PECAS.map((peca) => ({
      url: `${MARCA.url}/?peca=${peca.slug}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    /*
      As peças internas (06/08) têm rota de verdade além do cartão na vitrine —
      /calculadora e, depois, /chat, /leitura, /resumo-semanal. Cada uma tem
      metadata e canonical próprios, então cada uma é página indexável por si,
      não só uma variação de ?peca=. Prioridade acima das variações da home
      porque é a URL que circula em proposta.
    */
    ...PECAS.filter((peca) => peca.interna).map((peca) => ({
      url: `${MARCA.url}${peca.url}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
