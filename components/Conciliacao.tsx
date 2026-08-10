"use client";

import { useId, useMemo, useState } from "react";
import {
  CAMPOS,
  CAMPO_OBRIGATORIO,
  CAMPO_ROTULO,
  LADOS,
  LADO_ROTULO,
  LIMITE_LINHAS,
  PARAMETROS_PADRAO,
  chutarMapa,
  conciliar,
  csvConciliacao,
  mapaCompleto,
  normalizar,
  totalDe,
  totalDosPares,
  type Lado,
  type Lancamento,
  type LeituraLado,
  type Mapa,
  type Par,
  type Parametros,
} from "@/lib/conciliacao";
import { dataBR, decodificar, lerCsv, reais, type Tabela } from "@/lib/tabela";

/**
 * O que não bate entre o extrato e a planilha — brief-11.
 *
 * O componente é casca: toda decisão que importa (o que casa com o quê, por
 * que um par é provável, se a conta fecha) mora em `lib/conciliacao.ts` e é
 * conferida fora do navegador, em 63 conferências. Aqui só há estado de tela.
 *
 * **Nada sobe.** Não existe `fetch` para servidor nenhum nesta peça além dos
 * dois arquivos de exemplo, que são estáticos e vêm deste mesmo site. Extrato
 * bancário é o arquivo mais privado que alguém tem no computador — e é por isso
 * que a frase está acima do campo, não no rodapé.
 *
 * **A ordem da tela inverte a ordem do brief de propósito**, e a decisão está
 * registrada no bloco de 10/08: a aritmética primeiro, porque é o que prova que
 * nada sumiu; os prováveis pares depois, porque são a única lista que pergunta
 * algo a quem lê; os casados por último e recolhidos, porque o nome da peça é
 * *o que não bate* e cem linhas que deram certo enterram a resposta.
 */

const MAX_BYTES = 4 * 1024 * 1024;

type Etapa = "vazio" | "mapear" | "pronto";

type Arquivo = { nome: string; tabela: Tabela };

const EXEMPLOS: Record<Lado, string> = {
  extrato: "/exemplos/extrato-exemplo.csv",
  planilha: "/exemplos/lancamentos-exemplo.csv",
};

const AJUDA: Record<Lado, string> = {
  extrato: "No internet banking: Extrato → Exportar → CSV (ou Excel, e salve como CSV).",
  planilha: "No Excel ou no Sheets: Arquivo → Salvar como / Baixar → CSV.",
};

export function Conciliacao() {
  const id = useId();

  const [arquivos, setArquivos] = useState<Record<Lado, Arquivo | null>>({
    extrato: null,
    planilha: null,
  });
  const [mapas, setMapas] = useState<Record<Lado, Mapa | null>>({ extrato: null, planilha: null });
  const [erros, setErros] = useState<Record<Lado, string | null>>({ extrato: null, planilha: null });
  const [arrastando, setArrastando] = useState<Lado | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  const [parametros, setParametros] = useState<Parametros>(PARAMETROS_PADRAO);
  const [baixando, setBaixando] = useState(false);

  const etapa: Etapa = !arquivos.extrato || !arquivos.planilha ? "vazio" : confirmado ? "pronto" : "mapear";

  /* ------------------------------------------------------------- a entrada */

  function receber(lado: Lado, texto: string, nome: string) {
    const lido = lerCsv(texto);
    if ("erro" in lido) {
      setErros((e) => ({ ...e, [lado]: lido.erro }));
      return;
    }
    if (lido.linhas.length > LIMITE_LINHAS) {
      setErros((e) => ({
        ...e,
        [lado]: `Este arquivo tem ${lido.linhas.length.toLocaleString("pt-BR")} linhas. Acima de ${LIMITE_LINHAS.toLocaleString("pt-BR")} a comparação trava a aba, então prefiro avisar a congelar. Corte por período e tente de novo.`,
      }));
      return;
    }
    setErros((e) => ({ ...e, [lado]: null }));
    setArquivos((a) => ({ ...a, [lado]: { nome, tabela: lido } }));
    setMapas((m) => ({ ...m, [lado]: chutarMapa(lido.cabecalho) }));
    setConfirmado(false);
  }

  async function comArquivo(lado: Lado, file: File) {
    if (file.size > MAX_BYTES) {
      setErros((e) => ({ ...e, [lado]: "Arquivo acima de 4 MB. Extrato de um mês não chega perto disso." }));
      return;
    }
    receber(lado, decodificar(await file.arrayBuffer()), file.name);
  }

  async function carregarExemplos() {
    for (const lado of LADOS) {
      const r = await fetch(EXEMPLOS[lado]);
      receber(lado, decodificar(await r.arrayBuffer()), EXEMPLOS[lado].split("/").pop()!);
    }
  }

  function limpar() {
    setArquivos({ extrato: null, planilha: null });
    setMapas({ extrato: null, planilha: null });
    setErros({ extrato: null, planilha: null });
    setConfirmado(false);
    setParametros(PARAMETROS_PADRAO);
  }

  /* --------------------------------------------------------------- o miolo */

  const leituras = useMemo<Record<Lado, LeituraLado> | null>(() => {
    if (!arquivos.extrato || !arquivos.planilha || !mapas.extrato || !mapas.planilha) return null;
    if (!mapaCompleto(mapas.extrato) || !mapaCompleto(mapas.planilha)) return null;
    return {
      extrato: normalizar(arquivos.extrato.tabela, mapas.extrato, "extrato"),
      planilha: normalizar(arquivos.planilha.tabela, mapas.planilha, "planilha"),
    };
  }, [arquivos, mapas]);

  const resultado = useMemo(
    () => (leituras && confirmado ? conciliar(leituras.extrato, leituras.planilha, parametros) : null),
    [leituras, confirmado, parametros],
  );

  function baixar() {
    if (!leituras || !resultado) return;
    setBaixando(true);
    const blob = new Blob([csvConciliacao(leituras.extrato, leituras.planilha, resultado)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "conciliacao.csv";
    a.click();
    URL.revokeObjectURL(url);
    setBaixando(false);
  }

  /* ---------------------------------------------------------------- a tela */

  return (
    <div className="cc">
      <div className="cc-aviso">
        <p>
          <strong>Os dois arquivos ficam no seu navegador.</strong> Não existe upload nesta
          página: a leitura, a comparação e o CSV de saída acontecem no seu computador, e
          tudo some quando você fecha a aba. Dá para conferir na aba de rede do navegador —
          nenhuma requisição sai daqui com o seu extrato dentro.
        </p>
        <p>
          Isto importa mais aqui do que nas outras peças. Extrato bancário é o arquivo mais
          privado que uma empresa tem, e nenhuma demonstração vale pedir que você o entregue
          a um estranho.
        </p>
      </div>

      {/* ------------------------------------------------------ os dois campos */}

      <div className="cc-entradas">
        {LADOS.map((lado) => (
          <div key={lado} className="cc-entrada-caixa">
            <p className="cc-entrada-titulo">{LADO_ROTULO[lado]}</p>

            <div
              className={`cc-solta${arrastando === lado ? " arrastando" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setArrastando(lado);
              }}
              onDragLeave={() => setArrastando(null)}
              onDrop={(e) => {
                e.preventDefault();
                setArrastando(null);
                const f = e.dataTransfer.files[0];
                if (f) void comArquivo(lado, f);
              }}
            >
              <input
                className="cc-input"
                id={`${id}-${lado}`}
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void comArquivo(lado, f);
                  e.target.value = "";
                }}
              />
              <label className="cc-rotulo" htmlFor={`${id}-${lado}`}>
                <span className="cc-rotulo-forte">
                  {arquivos[lado] ? arquivos[lado]!.nome : "Arraste o CSV ou clique"}
                </span>
                <span className="cc-rotulo-fraco">
                  {arquivos[lado]
                    ? `${arquivos[lado]!.tabela.linhas.length} linhas · cabeçalho na linha ${arquivos[lado]!.tabela.linhaCabecalho}`
                    : AJUDA[lado]}
                </span>
              </label>
            </div>

            {erros[lado] && <p className="cc-erro">{erros[lado]}</p>}
          </div>
        ))}
      </div>

      <div className="cc-atalhos">
        <button className="botao-discreto" type="button" onClick={() => void carregarExemplos()}>
          Carregar um par de exemplo
        </button>
        {(arquivos.extrato || arquivos.planilha) && (
          <button className="botao-discreto" type="button" onClick={limpar}>
            Limpar
          </button>
        )}
      </div>

      {etapa === "vazio" && (arquivos.extrato || arquivos.planilha) && (
        <p className="cc-nota">
          Falta {arquivos.extrato ? "a planilha de lançamentos" : "o extrato do banco"}. A peça
          precisa dos dois para ter o que comparar.
        </p>
      )}

      {/* --------------------------------------------------------- o mapeador */}

      {etapa === "mapear" && (
        <section className="cc-mapa">
          <div className="cc-mapa-cabeca">
            <h2>Qual coluna é qual?</h2>
            <p>
              Relatório de sistema não tem formato: a mesma data chega como <code>Data</code>,{" "}
              <code>Dt Lanç.</code> ou <code>DATA_MOVIMENTO</code>. Eu chuto pelo cabeçalho e
              mostro o chute — as três primeiras linhas de cada arquivo estão logo abaixo para
              você conferir. Corrija o que estiver errado antes de comparar.
            </p>
          </div>

          {LADOS.map((lado) => {
            const arq = arquivos[lado]!;
            const mapa = mapas[lado]!;
            return (
              <div key={lado} className="cc-mapa-lado">
                <h3 className="cc-mapa-lado-titulo">
                  {LADO_ROTULO[lado]} <span className="cc-fraco">— {arq.nome}</span>
                </h3>

                <div className="cc-campos">
                  {CAMPOS.map((campo) => (
                    <label key={campo} className="cc-campo">
                      <span className="cc-campo-rotulo">
                        {CAMPO_ROTULO[campo]}
                        {!CAMPO_OBRIGATORIO[campo] && <span className="cc-opcional"> (opcional)</span>}
                      </span>
                      <select
                        value={mapa[campo]}
                        onChange={(e) =>
                          setMapas((m) => ({ ...m, [lado]: { ...m[lado]!, [campo]: Number(e.target.value) } }))
                        }
                      >
                        <option value={-1}>— não tem —</option>
                        {arq.tabela.cabecalho.map((h, i) => (
                          <option key={i} value={i}>
                            {h || `(coluna ${i + 1} sem nome)`}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>

                <div className="cc-rolo">
                  <table className="cc-previa">
                    <thead>
                      <tr>
                        {arq.tabela.cabecalho.map((h, i) => {
                          const usada = CAMPOS.find((c) => mapa[c] === i);
                          return (
                            <th key={i} className={usada ? "cc-col-usada" : undefined}>
                              {h || `(coluna ${i + 1})`}
                              {usada && <span className="cc-col-marca">{CAMPO_ROTULO[usada]}</span>}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {arq.tabela.linhas.slice(0, 3).map((linha, i) => (
                        <tr key={i}>
                          {arq.tabela.cabecalho.map((_, j) => (
                            <td key={j}>{linha[j] ?? ""}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {!mapaCompleto(mapa) && (
                  <p className="cc-alerta">
                    Faltam <strong>data</strong> e <strong>valor</strong> — são os dois que o
                    casamento usa. Sem eles não há o que comparar.
                  </p>
                )}
              </div>
            );
          })}

          <div className="cc-acoes">
            <button
              className="btn-primario"
              type="button"
              disabled={!leituras}
              onClick={() => setConfirmado(true)}
            >
              Comparar os dois
            </button>
          </div>
        </section>
      )}

      {/* --------------------------------------------------------- o resultado */}

      {etapa === "pronto" && leituras && resultado && (
        <>
          <Aritmetica leituras={leituras} resultado={resultado} />

          <section className="cc-painel">
            <h2 className="cc-secao">Os parâmetros do casamento</h2>
            <p className="cc-nota">
              Aperte a janela para 1 dia e veja prováveis pares desaparecerem. É assim que
              você descobre se confia no resto — número sem explicação não convence ninguém
              que já chegou desconfiado.
            </p>
            <div className="cc-parametros">
              <label>
                Janela, em dias
                <input
                  type="number"
                  min={0}
                  max={90}
                  value={parametros.janelaDias}
                  onChange={(e) => setParametros((p) => ({ ...p, janelaDias: Math.max(0, Number(e.target.value) || 0) }))}
                />
              </label>
              <label>
                Tolerância, em %
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={parametros.toleranciaPercent}
                  onChange={(e) => setParametros((p) => ({ ...p, toleranciaPercent: Math.max(0, Number(e.target.value) || 0) }))}
                />
              </label>
              <label>
                Tolerância mínima, em R$
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={parametros.toleranciaReais}
                  onChange={(e) => setParametros((p) => ({ ...p, toleranciaReais: Math.max(0, Number(e.target.value) || 0) }))}
                />
              </label>
            </div>
            <p className="cc-nota">
              Vale a maior das duas tolerâncias. Com 5% e R$ 5, um par de R$ 40 aceita R$ 5 de
              diferença e um de R$ 4.000 aceita R$ 200.
            </p>
          </section>

          <Provaveis pares={resultado.provaveis} />

          <Orfaos
            titulo="Só no extrato"
            explicacao="Entrou ou saiu da conta e não existe na sua planilha. É dinheiro que se mexeu sem registro — tarifa, débito automático, ou uma venda que ninguém lançou."
            lancamentos={resultado.soExtrato}
          />

          <Orfaos
            titulo="Só na planilha"
            explicacao="Está lançado e não apareceu na conta. Pode ser o que ainda não caiu, ou o que nunca vai cair."
            lancamentos={resultado.soPlanilha}
          />

          <Casados pares={resultado.casados} />

          {LADOS.some((l) => leituras[l].descartadas.length > 0) && (
            <section className="cc-painel">
              <h2 className="cc-secao">Linhas que não deram para ler</h2>
              <p className="cc-nota">
                Estas não entraram na comparação — e por isso estão aqui, com o número da
                linha do arquivo original, que é o mesmo que o Excel mostra. Nada some em
                silêncio.
              </p>
              {LADOS.map((lado) =>
                leituras[lado].descartadas.length === 0 ? null : (
                  <div key={lado}>
                    <h3 className="cc-mapa-lado-titulo">{LADO_ROTULO[lado]}</h3>
                    <ul className="cc-descartadas">
                      {leituras[lado].descartadas.map((d) => (
                        <li key={d.linha}>
                          <strong>linha {d.linha}</strong> — {d.motivo}
                        </li>
                      ))}
                    </ul>
                  </div>
                ),
              )}
            </section>
          )}

          <section className="cc-painel">
            <h2 className="cc-secao">Levar para o contador</h2>
            <p className="cc-nota">
              Um arquivo só, com <strong>todas</strong> as linhas dos dois arquivos e três
              colunas a mais: <code>situacao</code>, <code>motivo</code> e{" "}
              <code>casou_com</code>. O provável par vai junto e vai com o motivo escrito — sem
              essa coluna, uma sugestão chega do outro lado como um par fechado.
            </p>
            <div className="cc-acoes">
              <button className="btn-primario" type="button" onClick={baixar} disabled={baixando}>
                Baixar o CSV
              </button>
              <button className="botao-discreto" type="button" onClick={() => setConfirmado(false)}>
                Voltar e remapear
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- a aritmética */

/**
 * O crivo, e ele é a primeira coisa da tela.
 *
 * Não diz que o casamento está certo — nenhum programa sabe disso. Diz que
 * nenhuma linha foi perdida nem contada duas vezes, que é como um motor de diff
 * falha sem que a tela mostre. Quando não fecha, as listas continuam desenhadas
 * embaixo, mas com o aviso em cima: esconder o resultado seria pior que mostrar
 * um resultado com defeito declarado.
 */
function Aritmetica({
  leituras,
  resultado,
}: {
  leituras: Record<Lado, LeituraLado>;
  resultado: ReturnType<typeof conciliar>;
}) {
  const c = resultado.conferencia;

  return (
    <section className={`cc-painel cc-crivo${c.fecha ? "" : " nao"}`}>
      <h2 className="cc-secao">{c.fecha ? "A conta fecha" : "A conta não fechou"}</h2>

      <div className="cc-crivo-lados">
        {LADOS.map((lado) => {
          const d = c.lados[lado];
          return (
            <div key={lado} className="cc-crivo-lado">
              <p className="cc-crivo-nome">{LADO_ROTULO[lado]}</p>
              <p className="cc-crivo-linha">
                <strong>{d.lancamentos}</strong> linhas viraram lançamento,{" "}
                <strong>{d.classificados}</strong> foram classificadas
                {leituras[lado].descartadas.length > 0 && (
                  <> · {leituras[lado].descartadas.length} não deram para ler</>
                )}
              </p>
              <p className="cc-crivo-linha">
                <strong>{reais(d.totalLido / 100)}</strong> lidos,{" "}
                <strong>{reais(d.totalClassificado / 100)}</strong> distribuídos nas quatro listas
              </p>
            </div>
          );
        })}
      </div>

      {c.fecha ? (
        <p className="cc-nota">
          Toda linha lida caiu em exatamente uma lista, e a soma dos valores absolutos bate ao
          centavo dos dois lados. É a peça conferindo a si mesma — é crivo, não garantia: dois
          erros podem se cancelar.
        </p>
      ) : (
        <ul className="cc-descartadas">
          {c.problemas.map((p, i) => (
            <li key={i}>
              <strong>{p.lado === "os dois" ? "nos dois arquivos" : LADO_ROTULO[p.lado]}</strong> — {p.texto}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* --------------------------------------------------------- os prováveis pares */

/**
 * Um provável par são duas linhas emparelhadas, nunca uma linha de sete colunas.
 *
 * Decisão tomada antes de construir, e o motivo está em `notas.md`: a N2 deu
 * quatro paradas fora do brief e as quatro foram de layout. Sete colunas, duas
 * delas texto livre, é a armadilha do `<td>` outra vez — `max-width` em célula é
 * ignorado com `table-layout: auto`, e foi assim que a coluna de valor nasceu
 * fora da área visível na `/nota-fiscal`.
 */
function Provaveis({ pares }: { pares: Par[] }) {
  return (
    <section className="cc-painel">
      <h2 className="cc-secao">
        Prováveis pares <span className="cc-contagem">{pares.length}</span>
      </h2>
      <p className="cc-nota">
        Estes <strong>não</strong> estão casados. Batem quase — e a peça diz o quanto e por
        quê, em vez de decidir por você. É a diferença entre um conciliador e um{" "}
        <code>INNER JOIN</code>: conciliação de verdade é cheia de quase-pares, e quem só faz
        casamento exato devolve quarenta órfãos e não serve para nada.
      </p>
      <p className="cc-nota">
        Três caminhos chegam aqui: <strong>mesmo valor com a data deslocada</strong> dentro da
        janela, <strong>valor menor</strong> dentro da tolerância, e{" "}
        <strong>mesmo número de documento</strong> — este último sem janela e sem tolerância
        nenhuma, porque um boleto pago com duas semanas de atraso e juros continua sendo
        aquele boleto. Documento que se repete no próprio arquivo é ignorado: numeração
        interna não identifica ninguém.
      </p>

      {pares.length === 0 ? (
        <p className="cc-vazio">Nenhum. Com os parâmetros atuais, ou casou exato ou ficou órfão.</p>
      ) : (
        <ul className="cc-pares">
          {pares.map((par, i) => (
            <li key={i} className="cc-par">
              <div className="cc-par-lados">
                {LADOS.map((lado) => (
                  <div key={lado} className="cc-par-lado">
                    <p className="cc-par-etiqueta">
                      {LADO_ROTULO[lado]} · linha {par[lado].linha}
                    </p>
                    <p className="cc-par-corpo">
                      <span className="cc-par-data">{dataBR(par[lado].data)}</span>
                      <span className="cc-par-valor">{reais(par[lado].valor)}</span>
                    </p>
                    <p className="cc-par-desc">{par[lado].descricao || <span className="cc-fraco">sem descrição</span>}</p>
                  </div>
                ))}
              </div>
              <p className="cc-par-motivo">{par.motivo}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------- órfãos */

function Orfaos({
  titulo,
  explicacao,
  lancamentos,
}: {
  titulo: string;
  explicacao: string;
  lancamentos: Lancamento[];
}) {
  return (
    <section className="cc-painel">
      <h2 className="cc-secao">
        {titulo} <span className="cc-contagem">{lancamentos.length}</span>
        {lancamentos.length > 0 && <span className="cc-total">{reais(totalDe(lancamentos))}</span>}
      </h2>
      <p className="cc-nota">{explicacao}</p>

      {lancamentos.length === 0 ? (
        <p className="cc-vazio">Nenhum. Tudo daqui achou par do outro lado.</p>
      ) : (
        <div className="cc-rolo">
          <table className="cc-tabela">
            <thead>
              <tr>
                <th>Linha</th>
                <th>Data</th>
                <th>Descrição</th>
                <th>Documento</th>
                <th className="cc-num">Valor</th>
              </tr>
            </thead>
            <tbody>
              {lancamentos.map((l) => (
                <tr key={l.chave}>
                  <td>{l.linha}</td>
                  <td>{dataBR(l.data)}</td>
                  <td>
                    <span className="cc-corte">{l.descricao || "—"}</span>
                  </td>
                  <td>{l.documento ?? "—"}</td>
                  <td className="cc-num">{reais(l.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ casados */

/**
 * Recolhido, não ausente.
 *
 * O nome público da peça é *o que não bate*. Abrir esta lista junto com as
 * outras três enterra a resposta embaixo de dezenas de linhas que deram certo.
 * Mas o cético precisa poder conferir o casamento — ele só não precisa disso na
 * primeira tela, e um clique resolve.
 */
function Casados({ pares }: { pares: Par[] }) {
  return (
    <details className="cc-painel cc-dobra">
      <summary>
        <span className="cc-secao">
          Casaram exato <span className="cc-contagem">{pares.length}</span>
          {pares.length > 0 && <span className="cc-total">{reais(totalDosPares(pares, "extrato"))}</span>}
        </span>
        <span className="cc-nota">Mesma data, mesmo valor. Clique para conferir linha a linha.</span>
      </summary>

      {pares.length === 0 ? (
        <p className="cc-vazio">Nenhum par exato — vale olhar se as datas dos dois arquivos estão no mesmo período.</p>
      ) : (
        <div className="cc-rolo">
          <table className="cc-tabela">
            <thead>
              <tr>
                <th>Data</th>
                <th className="cc-num">Valor</th>
                <th>Extrato</th>
                <th>Planilha</th>
              </tr>
            </thead>
            <tbody>
              {pares.map((par, i) => (
                <tr key={i}>
                  <td>{dataBR(par.extrato.data)}</td>
                  <td className="cc-num">{reais(par.extrato.valor)}</td>
                  <td>
                    <span className="cc-corte">
                      <span className="cc-fraco">L{par.extrato.linha}</span> {par.extrato.descricao || "—"}
                    </span>
                  </td>
                  <td>
                    <span className="cc-corte">
                      <span className="cc-fraco">L{par.planilha.linha}</span> {par.planilha.descricao || "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}
