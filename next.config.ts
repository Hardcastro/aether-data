import type { NextConfig } from "next";
import { PECAS, TIPOS } from "./lib/manifesto";

/**
 * Até 06/08 toda peça morava na home, em `/?peca=slug`. Essas URLs estão no
 * sitemap desde 03/08, circularam e podem estar coladas em proposta — então
 * elas não podem passar a mostrar a home nova em silêncio.
 *
 * Um redirecionamento permanente por peça, gerado do manifesto: peça nova
 * entra sozinha, peça que mude de tipo passa a apontar para a vitrine certa no
 * mesmo commit que mudar o `tipo`. É estático, resolvido no build — sem
 * middleware e sem custo por requisição.
 *
 * `permanent: true` porque a mudança é definitiva e queremos que o buscador
 * transfira o histórico da URL antiga em vez de indexar as duas.
 */
const nextConfig: NextConfig = {
  async redirects() {
    return PECAS.map((peca) => ({
      source: "/",
      has: [{ type: "query" as const, key: "peca", value: peca.slug }],
      destination: `${TIPOS[peca.tipo].rota}?peca=${peca.slug}`,
      permanent: true,
    }));
  },
};

export default nextConfig;
