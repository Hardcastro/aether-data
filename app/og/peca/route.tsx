import { ImageResponse } from "next/og";
import { MARCA } from "@/site.config";
import { GRUPOS, pecaPorSlug } from "@/lib/manifesto";

const size = { width: 1200, height: 630 };

/**
 * opengraph-image.tsx não recebe searchParams — não dá para gerar preview
 * por peça nesse arquivo especial. Por isso /?peca=slug aponta pra cá.
 * Ver seção 10 do prompt-claude-code-04.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");
  const peca = slug ? pecaPorSlug(slug) : undefined;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(140deg, #ffffff 0%, #f3faf7 55%, #e9f6f0 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 22,
            fontWeight: 600,
            color: "#065f46",
            textTransform: "uppercase",
            letterSpacing: 2,
          }}
        >
          {MARCA.nome}
          {peca ? ` · ${GRUPOS[peca.grupo].titulo}` : ""}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 22,
            fontSize: peca ? 60 : 76,
            fontWeight: 600,
            color: "#0f172a",
            maxWidth: 1000,
          }}
        >
          {peca ? peca.nome : MARCA.nome}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 24,
            fontSize: 32,
            color: "#134e4a",
            maxWidth: 980,
          }}
        >
          {peca ? peca.capacidade : MARCA.promessa}
        </div>
      </div>
    ),
    size
  );
}
