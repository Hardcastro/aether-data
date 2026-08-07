import type { Metadata } from "next";
import Link from "next/link";
import { MARCA } from "@/site.config";
import { pecaPorSlug, rotaDaPeca } from "@/lib/manifesto";
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

  const calculadora = pecaPorSlug("calculadora-custo");

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
            {calculadora && (
              <p>
                Se você chegou aqui querendo saber quanto custa o processo
                manual que te trouxe: a conta está aberta e dá para usar agora,
                sem deixar nenhum dado.{" "}
                <Link href={rotaDaPeca(calculadora)}>{calculadora.nome} →</Link>
              </p>
            )}
          </section>
        )}

        <div className="ferramenta-pe">
          <p>Ou comece pelas peças, que respondem antes de qualquer conversa.</p>
          <div className="prosa-acoes">
            <Link className="btn-primario" href="/sites">
              Ver os sites →
            </Link>
            <Link className="btn-secundario" href="/automacoes">
              Ver as automações →
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
