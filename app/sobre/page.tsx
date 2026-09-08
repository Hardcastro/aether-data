import type { Metadata } from "next";
import Link from "next/link";
import { MARCA } from "@/site.config";
import { GRUPOS_COM_PECAS, PECAS, TIPOS } from "@/lib/manifesto";
import { FundoCiclico } from "@/components/FundoCiclico";
import { Particulas } from "@/components/Particulas";

export const metadata: Metadata = {
  title: `Sobre mim — ${MARCA.nome}`,
  /*
    A anterior — "Quem faz as peças da AEther Data, e como trabalha" — descrevia
    a página em vez de dizer o que tem nela. É o que o buscador mostra embaixo do
    título, e é a única linha que decide o clique.
  */
  description:
    "Coordeno uma operação de sete pessoas e construo as ferramentas deste portfólio. Todas no ar, com o código aberto.",
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
  /*
    "10 das 10 têm o código público" é uma frase que parece defeito de sistema.
    Quando o número é o total, a frase certa é outra — e ela volta a contar
    sozinha no dia em que entrar uma peça fechada.
  */
  const todasAbertas = abertas === PECAS.length;
  /*
    Escrita à mão até aqui, e já errada: a lista dizia quatro competências
    quando o manifesto tinha seis — `confere` e `procura` ficaram de fora sem
    erro de tipo e sem quebrar nada. É o mesmo defeito que as vertentes tinham
    no rodapé desta página, corrigido no mesmo lugar: derivar em vez de repetir.
  */
  const competencias = GRUPOS_COM_PECAS.map((g) => g.titulo.toLowerCase()).join(", ");

  return (
    <>
      <FundoCiclico />
      <Particulas />

      <main className="ferramenta" id="conteudo">
        <header>
          <p className="ferramenta-grupo">Sobre mim</p>
          {/*
            "Gabriel de Castro" até 08/09/2026. O currículo e o LinkedIn dizem
            Gabriel Barreto e o GitHub é Hardcastro — quem saía do currículo para
            o hub encontrava um terceiro nome. Um só, e é este.
          */}
          <h1 className="ferramenta-titulo">Gabriel Barreto</h1>
          {/*
            A versão anterior abria dizendo que eu construo as peças sozinho.
            Verdade, e a coisa menos interessante que dá para dizer aqui: quem
            chega já está olhando para as peças. O que faltava era de onde elas
            vêm — e sem isso o conjunto lê como exercício, não como trabalho.

            Estas duas frases são as mesmas do README de perfil, que já estava
            publicado. Estavam no GitHub e não estavam no site do dono delas.
          */}
          <p className="ferramenta-linha">
            Coordeno uma equipe de sete pessoas numa operação de serviços e
            respondo por três indicadores que conflitam entre si: custo da
            escala, volume atendido e aproveitamento por visitante. As{" "}
            {PECAS.length} peças deste site são o mesmo trabalho em código — o
            arquivo que vira planilha, a lista que vira mensagem, o número que
            alguém conferia toda manhã.
          </p>
        </header>

        <section className="prosa">
          <h2>O que dá para conferir daqui</h2>
          {/*
            O nome da marca e o nome da pessoa precisavam ser ligados em algum
            lugar, e este é o lugar: quem chega pelo currículo procura Gabriel
            Barreto e encontra AEther Data no cabeçalho.
          */}
          <p>
            <strong>AEther Data é o nome do conjunto, não de uma empresa.</strong>{" "}
            Não há sociedade, não há equipe e não há cliente por trás dele — é o
            lugar onde eu publico o que construo, e o nome existe para as peças
            terem um endereço só.
          </p>
          <p>
            <strong>Nada aqui é maquete.</strong> Cada peça tem endereço próprio,
            funciona sem mim por perto, e foi escrita por mim sozinho — código,
            dado e texto.{" "}
            {/* A vírgula entra na expressão: fora dela o JSX deixa um espaço antes dela. */}
            {todasAbertas
              ? "Todas têm o código público,"
              : `${abertas} das ${PECAS.length} têm o código público,`}{" "}
            então dá para ler como foram feitas em vez de acreditar na descrição.
          </p>
          <p>
            <strong>As peças são agrupadas pelo que sabem fazer</strong> —{" "}
            {competencias} — e não pelo ramo do cliente. É por isso que uma delas
            é um cardápio de restaurante e outra é um painel de indicadores do
            Brasil: a capacidade é a mesma, o ramo é rótulo.
          </p>
          <p>
            <strong>Elas foram escritas para o dia ruim.</strong> O cardápio
            não quebra quando a planilha que o alimenta sai do ar; o painel
            de indicadores continua servindo as outras séries quando uma API
            pública falha; o formulário diz que falhou em vez de responder
            &ldquo;enviado&rdquo; sem ter enviado. Isso está no código de cada uma.
          </p>
          {/*
            A alegação mais forte do portfólio estava só dentro da /monitor, três
            cliques abaixo daqui. Quem lê um "sobre" está decidindo se confia —
            é o lugar exato dela.
          */}
          <p>
            <strong>Uma delas dá para conferir sem confiar em mim.</strong> O
            monitor roda uma vez por dia sozinho, e publica na própria página o
            registro de todas as rodadas — inclusive as silenciosas — com um
            número que confere esse registro contra o calendário. Automação
            agendada tem um problema de prova que as outras peças não têm: quando
            ela funciona, nada acontece.
          </p>
          {/*
            Os três sites de negócio inventado eram declarados nos metadados de
            cada destino desde 08/09, e em lugar nenhum do hub que manda o
            visitante para lá. Declarar no destino e calar na origem é declarar
            para o buscador e não para a pessoa.
          */}
          <p>
            <strong>Três dos sites são de negócios que não existem</strong> — um
            restaurante, uma distribuidora e um escritório de contabilidade,
            inventados para dar problema real a uma peça real. Cada um diz isso na
            própria página. O painel de indicadores não é: os números são do Banco
            Central e do IBGE, e é ele que alimenta o monitor.
          </p>
        </section>

        <div className="ferramenta-pe">
          <p>Comece pelas peças — elas respondem antes de qualquer conversa.</p>
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
