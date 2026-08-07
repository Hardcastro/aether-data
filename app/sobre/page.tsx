import type { Metadata } from "next";
import Link from "next/link";
import { MARCA } from "@/site.config";
import { PECAS } from "@/lib/manifesto";
import { FundoCiclico } from "@/components/FundoCiclico";
import { Particulas } from "@/components/Particulas";

export const metadata: Metadata = {
  title: `Sobre mim — ${MARCA.nome}`,
  description: "Quem faz as peças da AEther Data, e como trabalha.",
  alternates: { canonical: "/sobre" },
};

/*
  Toda afirmação desta página é verificável a partir das peças que estão no ar
  — e isso é uma regra, não um estilo.
​
  A primeira versão (07/08) tinha parágrafos em primeira pessoa sobre método e
  sobre o que ele não aceita fazer. Eram plausíveis e eram invenção minha:
  posicionamento comercial escrito por quem não é o dono do negócio, publicado
  como se fosse a voz dele. Foi reescrita para dizer só o que qualquer visitante
  pode conferir clicando — as peças estão todas abertas, com código.
​
  Ao reescrever com a voz dele, vale manter a regra: cada frase aqui deve ter
  uma peça no ar que a comprove. É o que separa este "sobre" dos outros.
*/
export default function Sobre() {
  const abertas = PECAS.filter((p) => p.repo).length;

  return (
    <>
      <FundoCiclico />
      <Particulas />

      <main className="ferramenta" id="conteudo">
        <header>
          <p className="ferramenta-grupo">Sobre mim</p>
          <h1 className="ferramenta-titulo">Gabriel de Castro</h1>
          <p className="ferramenta-linha">
            Construo as {PECAS.length} peças deste site — código, dado e texto —
            sozinho. Todas estão no ar e podem ser abertas agora.
          </p>
        </header>

        <section className="prosa">
          <h2>O que dá para conferir daqui</h2>
          <p>
            <strong>Nada aqui é maquete.</strong> Cada peça tem endereço próprio
            e funciona sem mim por perto. {abertas} das {PECAS.length} têm o
            código público, então dá para ler como foram feitas em vez de
            acreditar na descrição.
          </p>
          <p>
            <strong>As peças são agrupadas pelo que sabem fazer</strong> — puxar
            dado de onde ele está, entregar para quem precisa ler, deixar
            consultável, responder sozinha — e não pelo ramo do cliente. É por
            isso que uma delas é um cardápio de restaurante e outra é um painel
            de indicadores do Brasil: a capacidade é a mesma, o ramo é rótulo.
          </p>
          <p>
            <strong>Elas foram escritas para o dia ruim.</strong> O cardápio
            continua em pé quando a planilha que o alimenta sai do ar; o painel
            de indicadores continua servindo as outras séries quando uma API
            pública falha; o formulário diz que falhou em vez de responder
            &ldquo;enviado&rdquo; sem ter enviado. Isso está no código de cada uma.
          </p>
        </section>

        <div className="ferramenta-pe">
          <p>Comece pelas peças — elas respondem antes de qualquer conversa.</p>
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
