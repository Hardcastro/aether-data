import type { MetadataRoute } from "next";
import { MARCA } from "@/site.config";
import { PECAS, TIPOS, rotaDaPeca } from "@/lib/manifesto";

/**
 * S1, S3 e a peça 05 já tinham sitemap.ts — o hub não tinha nenhum (SEO,
 * 03/08).
 *
 * Reescrito em 07/08, quando a vitrine virou cinco rotas. Cada peça continua
 * sendo página indexável de verdade — tem title, description e og:image
 * próprios via generateMetadata — mas mora agora sob /sites ou /automacoes em
 * vez de sob a home. `rotaDaPeca` é a única a saber disso; aqui só chamamos.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const agora = new Date();

  return [
    {
      url: MARCA.url,
      lastModified: agora,
      changeFrequency: "weekly",
      priority: 1,
    },

    // As duas vitrines. Prioridade alta: são as páginas que dividem o
    // catálogo e as que fazem sentido circular sozinhas.
    ...Object.values(TIPOS).map((tipo) => ({
      url: `${MARCA.url}${tipo.rota}`,
      lastModified: agora,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    })),

    ...["/sobre", "/contato"].map((rota) => ({
      url: `${MARCA.url}${rota}`,
      lastModified: agora,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),

    ...PECAS.map((peca) => ({
      url: `${MARCA.url}${rotaDaPeca(peca)}`,
      lastModified: agora,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),

    /*
      As peças internas (06/08) têm rota de verdade além do cartão na vitrine —
      /nota-fiscal e, depois, /cobranca, /conciliacao, /monitor. Cada uma tem
      metadata e canonical próprios, então cada uma é página indexável por si.
      Prioridade acima das variações de vitrine porque é a URL que circula em
      proposta.
    */
    ...PECAS.filter((peca) => peca.interna).map((peca) => ({
      url: `${MARCA.url}${peca.url}`,
      lastModified: agora,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
