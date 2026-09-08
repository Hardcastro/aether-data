import type { Metadata } from "next";
import Link from "next/link";
import { MARCA } from "@/site.config";
import { TIPOS, pecaPorSlug, rotaDaPeca } from "@/lib/manifesto";
import { FundoCiclico } from "@/components/FundoCiclico";
import { Particulas } from "@/components/Particulas";

export const metadata: Metadata = {
  title: `Contatos — ${MARCA.nome}`,
  description: "Como falar comigo sobre um processo manual que você quer resolver.",
  alternates: { canonical: "/contato" },
};

/*
  ⚠ ESTA PÁGINA AINDA NÃO ENTREGA NADA — e diz isso, em vez de fingir.

  `MARCA.email` e `MARCA.whatsapp` são null desde que o hub foi criado
  (confirmado no `plano-portfolio.md`, item 5 do alinhamento de 06/08). Não
  existe canal de contato funcionando no site inteiro. A regra do vazio manda
  não desenhar o que não existe — então enquanto os dois forem null, esta
  página mostra o estado honesto e aponta para a única porta que já funciona.

  O caminho que o plano já previa, e que fecha isto de verdade:

  - Preencher `email`/`whatsapp` em site.config.ts destrava o bloco abaixo
    sozinho, sem tocar neste arquivo de novo.
  - A C2 (/leitura, `brief-08-email-que-responde.md`) é o formulário real desta
    página quando existir: o visitante descreve o processo manual dele e recebe
    a leitura por e-mail. Vira ponto de contato e demonstração no mesmo gesto —
    o mesmo raciocínio de "construída uma vez e usada duas" do plano.
  - As duas dependem de RESEND_API_KEY na Vercel, que o plano já classificou
    como pré-requisito de data, não pendência de qualidade.
*/
export default function Contato() {
  const canais = [
    MARCA.email ? { rotulo: MARCA.email, href: `mailto:${MARCA.email}` } : null,
    MARCA.whatsapp
      ? { rotulo: "WhatsApp", href: `https://wa.me/${MARCA.whatsapp}` }
      : null,
  ].filter((c): c is { rotulo: string; href: string } => c !== null);

  /*
    Era a calculadora até 10/08. Enterrada — ver o fim de PECAS em
    lib/manifesto.ts. A porta que sobra é a peça que faz trabalho de verdade
    com o arquivo de quem chegou, não a que estima o custo dele.
  */
  const porta = pecaPorSlug("nota-fiscal-planilha");

  return (
    <>
      <FundoCiclico />
      <Particulas />

      <main className="ferramenta" id="conteudo">
        <header>
          <p className="ferramenta-grupo">Contatos</p>
          <h1 className="ferramenta-titulo">Falar comigo</h1>
          <p className="ferramenta-linha">
            O que funciona melhor como primeira mensagem: uma frase descrevendo
            o que alguém faz na mão hoje, e quanto tempo por semana isso leva.
            Com isso eu já consigo dizer se tem peça aí ou não.
          </p>
        </header>

        {canais.length > 0 ? (
          <section className="prosa">
            <h2>Onde</h2>
            <div className="prosa-acoes">
              {canais.map((c) => (
                <a key={c.href} className="btn-primario" href={c.href}>
                  {c.rotulo}
                </a>
              ))}
            </div>
          </section>
        ) : (
          <section className="prosa">
            <h2>Ainda não tem canal aberto</h2>
            <p>
              O canal de contato desta página está sendo construído junto com as
              peças que faltam. Enquanto ele não existe, prefiro dizer isso a
              deixar um formulário que não entrega em lugar nenhum.
            </p>
            {porta && (
              <p>
                Se você chegou aqui com um processo manual em mente, a peça no
                ar já trabalha: arraste os XML das suas notas e leve a planilha
                pronta, sem cadastro e sem subir nada.{" "}
                <Link href={rotaDaPeca(porta)}>{porta.nome} →</Link>
              </p>
            )}
          </section>
        )}

        <div className="ferramenta-pe">
          <p>Ou comece pelas peças, que respondem antes de qualquer conversa.</p>
          {/*
            Derivado de TIPOS, e nao escrito a mao: ate 08/09 estes eram dois
            Link literais, e quando a terceira vertente entrou no manifesto
            estas duas paginas continuaram oferecendo duas de tres, sem erro
            de tipo e sem quebrar nada. Vertente nova aparece aqui sozinha.
          */}
          <div className="prosa-acoes">
            {Object.values(TIPOS).map((t, i) => (
              <Link
                key={t.chave}
                className={i === 0 ? "btn-primario" : "btn-secundario"}
                href={t.rota}
              >
                Ver {t.artigo} {t.titulo.toLowerCase()} →
              </Link>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
