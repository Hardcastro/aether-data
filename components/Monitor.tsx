"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CONDICOES,
  comUnidade,
  dataBr,
  descreverRodada,
  rotuloCondicao,
  type Avaliacao,
  type Condicao,
  type Contrafactual,
  type Crivo,
  type Rodada,
} from "@/lib/monitor";

/**
 * A tela da N4. A ordem das seções foi decidida no brief, em 11/08, e não é
 * arbitrária — ela responde aos noventa segundos de quem chega por uma
 * proposta e pergunta "o que roda sozinho na minha empresa":
 *
 *   1. o contador do crivo      — uma linha, o número mais improvável da tela
 *   2. a ferramenta             — responde na hora, sem pedir nada
 *   3. a tradução               — "na sua empresa o indicador é o seu"
 *   4. o registro completo      — para quem quiser cavar
 *   5. a inscrição              — a SAÍDA, nunca a entrada
 *
 * **O formulário de e-mail é a última coisa da página, de propósito.** Pedir
 * endereço antes de provar qualquer coisa é o desenho que faz o cético sair.
 *
 * A avaliação roda sozinha ao abrir, com valores já preenchidos: ninguém
 * precisa clicar em nada para ver a peça funcionando.
 */

type SerieOpcao = {
  id: string;
  nome: string;
  unidade: "%" | "R$";
  fonte: string;
  referencia: string;
  periodicidade: string;
  ultimo: { data: string; valor: number } | null;
};

type Resultado = {
  serie: SerieOpcao & { degradado: boolean };
  avaliacao: Avaliacao;
  base: string | null;
  contrafactual: Contrafactual;
};

type Props = {
  series: SerieOpcao[];
  registro: Rodada[];
  crivo: Crivo;
  inscricaoLigada: boolean;
  /** Falha na leitura da fonte no servidor — a tela diz, em vez de fingir */
  erroFonte: string | null;
};

/** Um chute inicial que quase sempre é verdadeiro hoje, para a primeira
 *  impressão da peça ser ela funcionando e não um formulário vazio. */
function valorInicial(serie: SerieOpcao | undefined): string {
  if (!serie?.ultimo) return "0";
  const v = serie.ultimo.valor;
  const alvo = Math.round(v * 0.9 * 100) / 100;
  return String(alvo).replace(".", ",");
}

function paraNumero(txt: string): number {
  return Number(txt.replace(/\./g, "").replace(",", "."));
}

/** Negrito de **asterisco** vindo das frases do motor, sem `dangerouslySet`. */
function ComForte({ texto }: { texto: string }) {
  const partes = texto.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {partes.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : p,
      )}
    </>
  );
}

export function Monitor({ series, registro, crivo, inscricaoLigada, erroFonte }: Props) {
  const [serieId, setSerieId] = useState(series[0]?.id ?? "");
  const [condicao, setCondicao] = useState<Condicao>("subir-acima");
  const [valor, setValor] = useState(() => valorInicial(series[0]));

  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [avaliando, setAvaliando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [inscrito, setInscrito] = useState<string | null>(null);
  const [erroInscricao, setErroInscricao] = useState<string | null>(null);

  const pedido = useRef(0);
  const serieAtual = series.find((s) => s.id === serieId);

  const avaliarAgora = useCallback(async () => {
    const n = paraNumero(valor);
    if (!serieId || !Number.isFinite(n)) return;

    const meu = ++pedido.current;
    setAvaliando(true);
    setErro(null);

    try {
      const r = await fetch("/api/monitor/avaliar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serie: serieId, condicao, valor: n }),
      });
      const dado = await r.json();
      if (meu !== pedido.current) return;

      if (!r.ok) {
        setErro(dado?.erro ?? "não consegui avaliar agora");
        setResultado(null);
      } else {
        setResultado(dado as Resultado);
      }
    } catch {
      if (meu === pedido.current) setErro("não consegui falar com a fonte agora");
    } finally {
      if (meu === pedido.current) setAvaliando(false);
    }
  }, [serieId, condicao, valor]);

  // Avalia sozinho ao abrir e a cada mudança, com uma pausa curta para não
  // disparar uma chamada por tecla digitada.
  useEffect(() => {
    const t = setTimeout(avaliarAgora, 400);
    return () => clearTimeout(t);
  }, [avaliarAgora]);

  function trocarSerie(id: string) {
    setSerieId(id);
    const nova = series.find((s) => s.id === id);
    setValor(valorInicial(nova));
    setInscrito(null);
  }

  async function inscrever(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErroInscricao(null);

    try {
      const r = await fetch("/api/monitor/inscrever", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, serie: serieId, condicao, valor: paraNumero(valor) }),
      });
      const dado = await r.json();
      if (!r.ok) setErroInscricao(dado?.erro ?? "não consegui enviar agora");
      else {
        setInscrito(dado.para as string);
        setEmail("");
      }
    } catch {
      setErroInscricao("não consegui enviar agora");
    } finally {
      setEnviando(false);
    }
  }

  const u = serieAtual?.unidade ?? "%";

  return (
    <div className="mn">
      {/* ─────────────── 1. o crivo ─────────────── */}

      <section className={`mn-crivo${crivo.fecha ? "" : " mn-crivo-furado"}`} aria-live="polite">
        <p className="mn-crivo-frase" data-teste="crivo">
          {crivo.frase}
        </p>
        <p className="mn-crivo-apoio">
          {crivo.fecha
            ? "Esta linha é calculada do próprio registro, aqui embaixo. Uma rodada que não tivesse acontecido apareceria como buraco — nesta frase, não em algum lugar da lista."
            : "Faltou rodada. O número acima é calculado do próprio registro, e ele acusa em vez de deixar você contar dias na lista."}
        </p>
      </section>

      {/* ─────────────── 2. a ferramenta ─────────────── */}

      <section className="mn-bloco">
        <h2 className="mn-subtitulo">Escreva uma regra. Ela é avaliada agora.</h2>

        {erroFonte && <p className="mn-erro">Não consegui ler a fonte agora — {erroFonte}.</p>}

        <div className="mn-regra">
          <label className="mn-campo">
            <span className="mn-campo-rotulo">Indicador</span>
            <select
              value={serieId}
              onChange={(e) => trocarSerie(e.target.value)}
              data-teste="serie"
            >
              {series.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </label>

          <label className="mn-campo">
            <span className="mn-campo-rotulo">Condição</span>
            <select
              value={condicao}
              onChange={(e) => {
                setCondicao(e.target.value as Condicao);
                setInscrito(null);
              }}
              data-teste="condicao"
            >
              {CONDICOES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.rotulo}
                </option>
              ))}
            </select>
          </label>

          <label className="mn-campo mn-campo-valor">
            <span className="mn-campo-rotulo">
              Valor <span className="mn-unidade">{u === "R$" ? "em reais" : "em pontos"}</span>
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={valor}
              onChange={(e) => {
                setValor(e.target.value);
                setInscrito(null);
              }}
              data-teste="valor"
            />
          </label>
        </div>

        {resultado?.base && <p className="mn-base">{resultado.base}</p>}

        <div className="mn-resposta" aria-live="polite" aria-busy={avaliando}>
          {erro && <p className="mn-erro">{erro}</p>}

          {!erro && resultado && (
            <>
              <p
                className={`mn-veredito ${
                  resultado.avaliacao.indefinida
                    ? "mn-veredito-indefinido"
                    : resultado.avaliacao.verdadeira
                      ? "mn-veredito-sim"
                      : "mn-veredito-nao"
                }`}
                data-teste="veredito"
              >
                {resultado.avaliacao.indefinida
                  ? "Indefinida hoje"
                  : resultado.avaliacao.verdadeira
                    ? "Verdadeira hoje — o aviso sairia na próxima rodada"
                    : "Falsa hoje — nenhum aviso sairia"}
              </p>

              <p className="mn-explicacao" data-teste="explicacao">
                {resultado.avaliacao.explicacao}
              </p>

              <p className="mn-contrafactual" data-teste="contrafactual">
                <ComForte texto={resultado.contrafactual.frase} />
              </p>

              {resultado.contrafactual.sugestao !== null && (
                <button
                  type="button"
                  className="botao-discreto"
                  onClick={() => setValor(String(resultado.contrafactual.sugestao).replace(".", ","))}
                >
                  Usar {comUnidade(resultado.contrafactual.sugestao, u)} em vez disso
                </button>
              )}

              {resultado.serie.degradado && (
                <p className="mn-nota">
                  Atenção: esta série veio do instantâneo versionado, não da fonte ao vivo — a
                  fonte não respondeu agora. A avaliação continua valendo para o dado que existe.
                </p>
              )}

              <p className="mn-procedencia">
                {resultado.serie.fonte} · {resultado.serie.referencia} ·{" "}
                {resultado.serie.periodicidade}
                {resultado.serie.ultimo && <> · última publicação em {dataBr(resultado.serie.ultimo.data)}</>}
              </p>
            </>
          )}
        </div>
      </section>

      {/* ─────────────── 3. a tradução ─────────────── */}

      <section className="mn-traducao">
        <h2 className="mn-subtitulo">Isto não é sobre a Selic</h2>
        <p>
          O indicador aqui é público <strong>porque a página é pública</strong> — é o que dá
          para deixar aberto na internet sem pedir nada a ninguém. Na sua empresa o indicador
          é o seu: o estoque que não pode furar, o prazo que vence, o saldo que não pode
          virar, a planilha que alguém deveria ter atualizado hoje e não atualizou.
        </p>
        <p>
          <strong>O mecanismo é o mesmo, e é este que você está vendo funcionar:</strong> uma
          regra escrita uma vez, uma rodada por dia, um aviso só quando a resposta muda — e um
          registro que prova que rodou, inclusive nos dias em que não aconteceu nada.
        </p>
      </section>

      {/* ─────────────── 4. o registro ─────────────── */}

      <section className="mn-bloco">
        <h2 className="mn-subtitulo">Todas as rodadas, inclusive as silenciosas</h2>

        {registro.length === 0 ? (
          <p className="mn-vazio">
            Nenhuma rodada ainda. A primeira acontece na próxima manhã, e aparece aqui sozinha.
          </p>
        ) : (
          <ol className="mn-registro" data-teste="registro">
            {registro.map((r, i) => (
              <li key={`${r.em}-${i}`} className={r.erro ? "mn-rodada mn-rodada-falha" : "mn-rodada"}>
                {descreverRodada(r)}
              </li>
            ))}
          </ol>
        )}

        <p className="mn-nota">
          O horário oscila até 59 minutos dentro da hora marcada — é assim que o agendador
          funciona no plano em uso. <strong>Não é defeito: é como se sabe que é um agendador
          de verdade.</strong> Registro forjado sai redondo.
        </p>
      </section>

      {/* ─────────────── 5. a inscrição, por último ─────────────── */}

      {inscricaoLigada && (
        <section className="mn-bloco mn-inscricao">
          <h2 className="mn-subtitulo">Quer que ela te avise?</h2>

          {inscrito ? (
            <p className="mn-ok" data-teste="inscrito">
              Mandei um e-mail para <strong>{inscrito}</strong>. Ele pede um clique — e é o
              único e-mail que um endereço não confirmado recebe. Enquanto você não clicar,
              nada foi guardado em lugar nenhum.
            </p>
          ) : (
            <form onSubmit={inscrever} className="mn-form">
              <p className="mn-form-linha">
                Você vai receber um aviso quando{" "}
                <strong>
                  {serieAtual?.nome} {rotuloCondicao(condicao)}{" "}
                  {Number.isFinite(paraNumero(valor)) ? comUnidade(paraNumero(valor), u) : "—"}
                </strong>
                . Uma vez por travessia, não todo dia.
              </p>

              <label className="mn-campo">
                <span className="mn-campo-rotulo">Seu e-mail</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@empresa.com.br"
                  data-teste="email"
                />
              </label>

              <button className="btn-primario" type="submit" disabled={enviando} data-teste="inscrever">
                {enviando ? "Enviando…" : "Me avise"}
              </button>

              {erroInscricao && <p className="mn-erro">{erroInscricao}</p>}

              <p className="mn-miudo">
                Um e-mail por travessia, e sair leva um clique. Não há painel, senha nem
                cadastro — e o seu endereço não é guardado antes de você confirmar.
              </p>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
