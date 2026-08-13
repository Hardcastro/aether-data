import type { Metadata } from "next";
import Link from "next/link";
import { MARCA } from "@/site.config";
import { pecaPorSlug } from "@/lib/manifesto";
import { lerFonte } from "@/lib/fonte";
import { lerRegistro, ligado as armazemLigado } from "@/lib/armazem";
import { ligado as correioLigado } from "@/lib/correio";
import { conferirCalendario } from "@/lib/monitor";
import { Monitor } from "@/components/Monitor";

/**
 * Quinta rota de ferramenta do hub — brief-14, a última das quatro automações.
 * É a peça que torna público o grupo `responde`, declarado vazio em 10/08.
 *
 * **É a única rota do portfólio que faz alguma coisa sem ninguém clicar.** As
 * outras quatro automações respondem a um arquivo que alguém arrasta; esta
 * roda de manhã, sozinha, e o que ela deixa é um registro.
 *
 * Largura padrão de 46rem, não a `ferramenta-larga`: o conteúdo mais largo
 * daqui é uma linha de registro, que é texto corrido. As duas peças anteriores
 * precisaram de 74rem por causa de tabela — esta não tem nenhuma.
 *
 * **Três variáveis, e nenhuma é pré-requisito de subir:**
 * `UPSTASH_REDIS_REST_URL`/`_TOKEN` (registro e regras), `RESEND_API_KEY` e
 * `SEGREDO_ASSINATURA` (inscrição). Faltando qualquer uma, a regra do vazio
 * tira a inscrição da tela e o resto continua inteiro — a avaliação em sessão
 * e o contrafactual não dependem de estado nenhum.
 */

const PECA = pecaPorSlug("monitor-com-regra")!;
const URL_PAGINA = new URL("/monitor", MARCA.url).toString();

export const metadata: Metadata = {
  title: `${PECA.nome} — ${MARCA.nome}`,
  description: PECA.capacidade,
  alternates: { canonical: URL_PAGINA },
  openGraph: {
    title: PECA.nome,
    description: PECA.capacidade,
    url: URL_PAGINA,
    images: [`${MARCA.url}/og/peca?slug=${PECA.slug}`],
  },
  twitter: {
    card: "summary_large_image",
    title: PECA.nome,
    description: PECA.capacidade,
    images: [`${MARCA.url}/og/peca?slug=${PECA.slug}`],
  },
};

/**
 * Dinâmica, e não por descuido: `lerFonte` e `lerRegistro` leem com
 * `cache: "no-store"`, o que já tira esta rota do prerender. Um `revalidate`
 * aqui seria letra morta — o build mostra a rota como ƒ de qualquer jeito.
 *
 * E é o comportamento certo. **O registro é o produto desta peça**: servir uma
 * cópia de dez minutos atrás significa que alguém pode abrir a página logo
 * depois de uma rodada e não vê-la, o que é exatamente a dúvida que a peça
 * existe para não deixar no ar.
 */
export const dynamic = "force-dynamic";

export default async function PaginaMonitor() {
  const [leitura, registro] = await Promise.all([lerFonte(false), lerRegistro()]);

  const series = leitura.series.map((s) => ({
    id: s.id,
    nome: s.nome,
    unidade: s.unidade,
    fonte: s.fonte,
    referencia: s.referencia,
    periodicidade: s.periodicidade,
    ultimo: s.ultimo,
  }));

  const crivo = conferirCalendario(registro, new Date().toISOString());
  const inscricaoLigada = armazemLigado() && correioLigado() && Boolean(process.env.SEGREDO_ASSINATURA);

  return (
    <>
      <style>{`:root:root{--bg-inner:${PECA.cor.inner};--bg-mid:${PECA.cor.mid};--bg-outer:${PECA.cor.outer}}`}</style>

      <main className="ferramenta" id="conteudo">
        <div className="ferramenta-cabeca">
          <p className="ferramenta-grupo">Responde sozinho</p>
          <h1 className="ferramenta-titulo">{PECA.nome}</h1>
          <p className="ferramenta-linha">
            Escreva uma regra sobre um indicador — <em>subir acima de</em>, <em>cair abaixo
            de</em>, <em>variar mais de</em> — e ela é avaliada agora, na sua frente. Depois,
            uma vez por dia, sozinha. Você só ouve falar dela quando a resposta muda.
          </p>
        </div>

        <Monitor
          series={series}
          registro={registro}
          crivo={crivo}
          inscricaoLigada={inscricaoLigada}
          erroFonte={leitura.ok ? null : (leitura.erro ?? "a fonte não respondeu")}
        />

        <div className="ferramenta-pe">
          <p>
            Uma automação agendada tem um problema de prova que nenhuma outra peça deste
            portfólio tem: <strong>quando ela funciona, nada acontece.</strong> O e-mail que
            não chegou porque nada mudou é indistinguível do e-mail que não chegou porque o
            agendador morreu.
          </p>
          <p>
            Por isso o produto desta peça não é o e-mail — é o registro público de todas as
            rodadas, e o número que confere esse registro contra o calendário. É a única
            alegação deste site inteiro que você pode verificar sem confiar em mim.
          </p>
          <p>
            <strong>E ela guarda estado</strong>, o que nenhuma outra peça daqui faz: as
            regras confirmadas e o registro moram num Redis. É um furo declarado no
            &ldquo;sem CMS, sem banco&rdquo; que o resto do portfólio cumpre — uma coisa que
            roda sozinha precisa lembrar do que já fez, senão avisa a mesma coisa todo dia.
          </p>
          <Link className="btn-secundario" href="/automacoes">
            ← Ver as automações no ar
          </Link>
        </div>
      </main>
    </>
  );
}
