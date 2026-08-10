"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  CAMPOS,
  CAMPO_OBRIGATORIO,
  CAMPO_ROTULO,
  ENCARGOS_DESLIGADOS,
  FAIXA_ROTULO,
  LIMITES_PADRAO,
  TETO_JUROS_MES,
  TETO_MULTA,
  TEXTOS_PADRAO,
  acrescimoDe,
  agrupar,
  chutarMapa,
  csvResumo,
  dataBR,
  decodificar,
  hojeISO,
  lerCsv,
  linkWhatsapp,
  mapaCompleto,
  montarMensagem,
  porFaixa,
  reais,
  totalComEncargos,
  type Devedor,
  type Encargos,
  type Faixa,
  type Limites,
  type Mapa,
  type Tabela,
  type Textos,
} from "@/lib/cobranca";

/**
 * A lista de quem deve vira as mensagens prontas — brief-15.
 *
 * O componente é casca: toda decisão que importa (o que é um telefone válido, a
 * que faixa um título pertence, o que a mensagem diz) mora em `lib/cobranca.ts`
 * e é conferida fora do navegador. Aqui só há estado de tela.
 *
 * **Nada sobe.** Não existe `fetch` neste arquivo, nem rota de API para esta
 * peça. O arquivo é lido por `FileReader` e morre quando a aba fecha. Isso pesa
 * mais aqui do que na `/nota-fiscal`: é lista de nome, telefone e dívida de
 * terceiros — gente que não está na sala para consentir.
 */

const MAX_BYTES = 4 * 1024 * 1024;

type Etapa = "vazio" | "mapear" | "pronto";

export function Cobranca() {
  const idCampo = useId();

  const [tabela, setTabela] = useState<Tabela | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [mapa, setMapa] = useState<Mapa | null>(null);
  const [confirmado, setConfirmado] = useState(false);

  const [hoje, setHoje] = useState("");
  const [limites, setLimites] = useState<Limites>(LIMITES_PADRAO);
  const [textos, setTextos] = useState<Textos>(TEXTOS_PADRAO);
  const [encargos, setEncargos] = useState<Encargos>(ENCARGOS_DESLIGADOS);

  /** Mensagens que a pessoa reescreveu à mão, por devedor. Sobrevivem a tudo. */
  const [editadas, setEditadas] = useState<Record<string, string>>({});
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [copiado, setCopiado] = useState<string | null>(null);

  /*
    A data de referência entra depois da primeira pintura, não durante.
    Renderizar `new Date()` no servidor e de novo no cliente é o caminho curto
    para um erro de hidratação que só aparece perto da meia-noite — e, pior, o
    servidor está em UTC, então a virada do dia dele não é a de quem lê.
  */
  useEffect(() => setHoje(hojeISO()), []);

  const etapa: Etapa = !tabela ? "vazio" : confirmado ? "pronto" : "mapear";

  const leitura = useMemo(() => {
    if (!tabela || !mapa || !confirmado || !hoje) return null;
    return agrupar(tabela, mapa, hoje, limites);
  }, [tabela, mapa, confirmado, hoje, limites]);

  function limpar() {
    setTabela(null);
    setNomeArquivo(null);
    setMapa(null);
    setConfirmado(false);
    setErro(null);
    setEditadas({});
    setAbertos({});
  }

  function engolirTexto(texto: string, nome: string) {
    const lido = lerCsv(texto);
    if ("erro" in lido) {
      setErro(lido.erro);
      setTabela(null);
      return;
    }
    setErro(null);
    setTabela(lido);
    setNomeArquivo(nome);
    setMapa(chutarMapa(lido.cabecalho));
    setConfirmado(false);
    setEditadas({});
  }

  function engolir(arquivo: File | undefined) {
    if (!arquivo) return;
    if (arquivo.size > MAX_BYTES) {
      setErro(
        `O arquivo tem ${(arquivo.size / 1024 / 1024).toFixed(1)} MB e o limite aqui é 4 MB. Relatório de contas a receber de PME não chega perto disso — se o seu chegou, provavelmente veio o histórico inteiro junto.`,
      );
      return;
    }
    const leitor = new FileReader();
    leitor.onload = () => engolirTexto(decodificar(leitor.result as ArrayBuffer), arquivo.name);
    leitor.onerror = () => setErro("Não consegui abrir esse arquivo.");
    // ArrayBuffer e não readAsText: quem decide o encoding é `decodificar`, e
    // `readAsText` sem rótulo assume UTF-8 e come o acento do nome do devedor.
    leitor.readAsArrayBuffer(arquivo);
  }

  async function carregarExemplo() {
    try {
      const r = await fetch("/exemplos/contas-a-receber-exemplo.csv");
      const bytes = await r.arrayBuffer();
      engolirTexto(decodificar(bytes), "contas-a-receber-exemplo.csv");
    } catch {
      setErro("Não consegui carregar o exemplo agora.");
    }
  }

  function mensagemDe(d: Devedor): string {
    return editadas[d.id] ?? montarMensagem(d, textos, encargos);
  }

  function baixarResumo() {
    if (!leitura) return;
    const blob = new Blob([csvResumo(leitura, encargos)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cobranca-resumo.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copiar(id: string, texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(id);
      setTimeout(() => setCopiado((c) => (c === id ? null : c)), 2000);
    } catch {
      setCopiado(null);
    }
  }

  const faixasPresentes: Faixa[] = leitura
    ? porFaixa([...leitura.devedores, ...leitura.semContato]).map((f) => f.faixa)
    : [];

  const acimaDoTeto =
    encargos.ligado &&
    (encargos.multaPercent > TETO_MULTA || encargos.jurosMesPercent > TETO_JUROS_MES);

  return (
    <div className="cb">
      {/* ------------------------------------------------------- as recusas */}
      <div className="cb-aviso">
        <p>
          <strong>A sua lista não sai do navegador.</strong> O arquivo é lido aqui dentro,
          não sobe para servidor nenhum e some quando você fecha a aba. Dá para conferir na
          aba de rede do seu navegador. Isto importa mais do que parece: são nome, telefone
          e dívida de <em>terceiros</em>, gente que não está aqui para concordar.
        </p>
        <p>
          <strong>Nada é enviado sozinho.</strong> Cada botão abre <em>uma</em> conversa com
          o texto pronto — quem aperta enviar é você. Disparo em massa derruba número de
          WhatsApp e transforma cobrança legítima em spam.
        </p>
      </div>

      {/* --------------------------------------------------------- a entrada */}
      {etapa === "vazio" ? (
        <>
          <div
            className={`cb-solta${arrastando ? " arrastando" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setArrastando(true);
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastando(false);
              engolir(e.dataTransfer.files[0]);
            }}
          >
            {/*
              O <input> é o controle e o <label> é a área inteira — quem usa
              teclado chega por Tab e abre com Enter, sem onKeyDown improvisado.
              Mesmo padrão da /nota-fiscal.
            */}
            <input
              id={idCampo}
              className="cb-entrada"
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              onChange={(e) => engolir(e.target.files?.[0])}
            />
            <label htmlFor={idCampo} className="cb-rotulo">
              <span className="cb-rotulo-forte">Arraste o seu CSV de contas a receber</span>
              <span className="cb-rotulo-fraco">
                ou clique para escolher · no Excel, Salvar como → CSV
              </span>
            </label>
          </div>

          <div className="cb-atalhos">
            <button type="button" className="botao-discreto" onClick={carregarExemplo}>
              Não tenho a lista agora — carregar um exemplo
            </button>
          </div>
        </>
      ) : null}

      {erro ? (
        <p className="cb-erro" role="alert">
          <strong>Não deu para ler.</strong> {erro}
        </p>
      ) : null}

      {/* -------------------------------------------------------- o mapeador */}
      {etapa === "mapear" && tabela && mapa ? (
        <section className="cb-mapa">
          <header className="cb-mapa-cabeca">
            <h2>Qual coluna é qual?</h2>
            <p>
              Li <strong>{tabela.linhas.length}</strong>{" "}
              {tabela.linhas.length === 1 ? "linha" : "linhas"} de{" "}
              <strong>{nomeArquivo}</strong>, com o cabeçalho na linha{" "}
              {tabela.linhaCabecalho}
              {tabela.rodapeCortado > 0
                ? ` e ${tabela.rodapeCortado} ${tabela.rodapeCortado === 1 ? "linha de rodapé cortada" : "linhas de rodapé cortadas"}`
                : ""}
              . Relatório de contas a receber não tem formato padrão — cada sistema nomeia
              as colunas do jeito dele. Chutei pelo cabeçalho; corrija o que errei.
            </p>
          </header>

          <div className="cb-campos">
            {CAMPOS.map((campo) => (
              <label key={campo} className="cb-campo">
                <span className="cb-campo-rotulo">
                  {CAMPO_ROTULO[campo]}
                  {CAMPO_OBRIGATORIO[campo] ? null : <span className="cb-opcional"> · opcional</span>}
                </span>
                <select
                  value={mapa[campo]}
                  onChange={(e) => setMapa({ ...mapa, [campo]: Number(e.target.value) })}
                >
                  <option value={-1}>— nenhuma —</option>
                  {tabela.cabecalho.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `(coluna ${i + 1} sem nome)`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {/*
            As três primeiras linhas à vista enquanto se escolhe. Sem isto o
            mapeamento vira adivinhação sobre nomes de coluna, que é justamente o
            problema que ele existe para resolver.
          */}
          <div className="cb-previa-rolo">
            <table className="cb-previa">
              <thead>
                <tr>
                  {tabela.cabecalho.map((h, i) => {
                    const campo = CAMPOS.find((c) => mapa[c] === i);
                    return (
                      <th key={i} className={campo ? "cb-col-usada" : undefined}>
                        {h || `coluna ${i + 1}`}
                        {campo ? <span className="cb-col-marca">{CAMPO_ROTULO[campo]}</span> : null}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {tabela.linhas.slice(0, 3).map((linha, i) => (
                  <tr key={i}>
                    {tabela.cabecalho.map((_, c) => (
                      <td key={c}>{linha[c] ?? ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="cb-mapa-acoes">
            <button
              type="button"
              className="btn-primario"
              disabled={!mapaCompleto(mapa)}
              onClick={() => setConfirmado(true)}
            >
              É isso — montar as mensagens →
            </button>
            <button type="button" className="botao-discreto" onClick={limpar}>
              Trocar de arquivo
            </button>
          </div>
          {!mapaCompleto(mapa) ? (
            <p className="cb-nota">
              Faltam colunas obrigatórias. Só <em>{CAMPO_ROTULO.referencia}</em> pode ficar sem.
            </p>
          ) : null}
        </section>
      ) : null}

      {/* --------------------------------------------------------- o resultado */}
      {etapa === "pronto" && leitura ? (
        <>
          <section className="cb-resumo">
            <div className="cb-resumo-linhas">
              {porFaixa([...leitura.devedores, ...leitura.semContato]).map((f) => (
                <div key={f.faixa} className="cb-resumo-item">
                  <span className="cb-resumo-faixa">{FAIXA_ROTULO[f.faixa]}</span>
                  <strong className="cb-resumo-valor">{reais(f.total)}</strong>
                  <span className="cb-resumo-quantos">
                    {f.quantos} {f.quantos === 1 ? "devedor" : "devedores"}
                  </span>
                </div>
              ))}
            </div>

            {/*
              A conta que fecha, dita em voz alta — herdada da calculadora
              enterrada, que tinha isso de bom, e do `somaConfere` da
              /nota-fiscal. Cinco números bonitos que não somam o total do
              arquivo são piores que nenhum número.
            */}
            <p className={`cb-fecha${leitura.somaConfere ? "" : " nao"}`}>
              {leitura.somaConfere ? (
                <>
                  A conta fecha: as faixas somam <strong>{reais(leitura.totalArquivo)}</strong>,
                  que é o total das {leitura.linhasLidas} linhas do arquivo.
                </>
              ) : (
                <>
                  <strong>A conta não fecha</strong> — as faixas não somam o total lido do
                  arquivo. Não confie nos números acima até saber por quê.
                </>
              )}
            </p>

            <div className="cb-parametros">
              <label>
                <span>Data de referência</span>
                <input type="date" value={hoje} onChange={(e) => setHoje(e.target.value)} />
              </label>
              <label>
                <span>Faixa curta até</span>
                <input
                  type="number"
                  min={1}
                  value={limites.curto}
                  onChange={(e) => setLimites({ ...limites, curto: Number(e.target.value) })}
                />
              </label>
              <label>
                <span>Média até</span>
                <input
                  type="number"
                  min={2}
                  value={limites.medio}
                  onChange={(e) => setLimites({ ...limites, medio: Number(e.target.value) })}
                />
              </label>
              <label>
                <span>Longa até</span>
                <input
                  type="number"
                  min={3}
                  value={limites.longo}
                  onChange={(e) => setLimites({ ...limites, longo: Number(e.target.value) })}
                />
              </label>
            </div>

            <div className="cb-resumo-acoes">
              <button type="button" className="botao-discreto" onClick={baixarResumo}>
                Baixar o resumo em CSV
              </button>
              <button type="button" className="botao-discreto" onClick={limpar}>
                Trocar de arquivo
              </button>
            </div>
          </section>

          {/* ------------------------------------------------------- encargos */}
          <details className="cb-bloco">
            <summary>Juros e multa — desligados</summary>
            <div className="cb-bloco-corpo">
              <p className="cb-nota">
                <strong>Estes campos nascem vazios de propósito.</strong> Multa e juros de
                mora só valem se estiverem previstos no contrato ou na nota, e esta página
                não conhece o seu contrato. Se você sabe o que combinou, digite aqui e a
                conta aparece aberta em cada título.
              </p>
              <label className="cb-liga">
                <input
                  type="checkbox"
                  checked={encargos.ligado}
                  onChange={(e) => setEncargos({ ...encargos, ligado: e.target.checked })}
                />
                <span>Somar encargos nos títulos vencidos</span>
              </label>
              <div className="cb-parametros">
                <label>
                  <span>Multa (%, uma vez)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    disabled={!encargos.ligado}
                    value={encargos.multaPercent}
                    onChange={(e) =>
                      setEncargos({ ...encargos, multaPercent: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  <span>Juros (% ao mês)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    disabled={!encargos.ligado}
                    value={encargos.jurosMesPercent}
                    onChange={(e) =>
                      setEncargos({ ...encargos, jurosMesPercent: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              {acimaDoTeto ? (
                <p className="cb-alerta" role="alert">
                  Em venda para consumidor, o usual é <strong>multa de até {TETO_MULTA}%</strong>{" "}
                  e <strong>juros de até {TETO_JUROS_MES}% ao mês</strong>. Você digitou acima
                  disso. A página não impede — só avisa, e não é parecer jurídico: confirme
                  com quem cuida dos seus contratos.
                </p>
              ) : null}
            </div>
          </details>

          {/* --------------------------------------------------- textos por faixa */}
          <details className="cb-bloco">
            <summary>Ajustar os textos por faixa</summary>
            <div className="cb-bloco-corpo">
              <p className="cb-nota">
                Estes são os textos padrão. Nenhum deles ameaça: não há menção a protesto,
                negativação ou nome sujo em faixa nenhuma, inclusive na mais velha. Mexer
                aqui refaz as mensagens que você ainda não reescreveu à mão.
              </p>
              {faixasPresentes.map((faixa) => (
                <div key={faixa} className="cb-texto-faixa">
                  <h3>{FAIXA_ROTULO[faixa]}</h3>
                  <label>
                    <span>Abertura · {"{nome}"} vira o nome de quem deve</span>
                    <textarea
                      rows={2}
                      value={textos[faixa].abertura}
                      onChange={(e) =>
                        setTextos({
                          ...textos,
                          [faixa]: { ...textos[faixa], abertura: e.target.value },
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>Fecho</span>
                    <textarea
                      rows={2}
                      value={textos[faixa].fecho}
                      onChange={(e) =>
                        setTextos({
                          ...textos,
                          [faixa]: { ...textos[faixa], fecho: e.target.value },
                        })
                      }
                    />
                  </label>
                </div>
              ))}
            </div>
          </details>

          {/* ---------------------------------------------------------- cartões */}
          <section className="cb-lista">
            <h2 className="cb-secao">
              {leitura.devedores.length}{" "}
              {leitura.devedores.length === 1 ? "mensagem pronta" : "mensagens prontas"}
            </h2>
            {leitura.devedores.map((d) => {
              const msg = mensagemDe(d);
              const link = linkWhatsapp(d, msg);
              const aberto = abertos[d.id] ?? false;
              return (
                <article key={d.id} className="cb-cartao">
                  <header className="cb-cartao-cabeca">
                    <div>
                      <h3>{d.nome}</h3>
                      <p className="cb-cartao-linha">
                        {reais(totalComEncargos(d, encargos))} · {d.titulos.length}{" "}
                        {d.titulos.length === 1 ? "título" : "títulos"} ·{" "}
                        <span className={`cb-faixa cb-faixa-${d.faixa.replace("+", "mais")}`}>
                          {FAIXA_ROTULO[d.faixa]}
                        </span>
                      </p>
                    </div>
                    <p className="cb-cartao-tel">
                      {d.telefone.original}
                      {d.telefone.aviso ? (
                        <span className="cb-cartao-aviso">{d.telefone.aviso}</span>
                      ) : null}
                    </p>
                  </header>

                  {d.telefonesConflitantes.length ? (
                    <p className="cb-nota">
                      Este nome aparece no arquivo com mais de um telefone. Estou usando o
                      primeiro; os outros: {d.telefonesConflitantes.join(", ")}.
                    </p>
                  ) : null}

                  <ul className="cb-titulos">
                    {d.titulos.map((t, i) => {
                      const acr = acrescimoDe(t, encargos);
                      return (
                        <li key={i}>
                          <span className="cb-titulo-ref">{t.referencia ?? "sem documento"}</span>
                          <span className="cb-titulo-valor">
                            {reais(t.valor)}
                            {acr.total > 0 ? (
                              <span className="cb-titulo-encargo">
                                {" + "}
                                {reais(acr.total)} ({reais(acr.multa)} multa +{" "}
                                {reais(acr.juros)} juros)
                              </span>
                            ) : null}
                          </span>
                          {/*
                            A conta dos dias fica à vista, não só a faixa. Quem
                            discorda do enquadramento vê de onde ele saiu — e
                            "vence hoje" é 0 dia, não 1.
                          */}
                          <span className="cb-titulo-dias">
                            {t.diasAtraso > 0
                              ? `venceu em ${dataBR(t.vencimento)} · ${t.diasAtraso} ${t.diasAtraso === 1 ? "dia" : "dias"}`
                              : t.diasAtraso === 0
                                ? `vence hoje, ${dataBR(t.vencimento)}`
                                : `vence em ${dataBR(t.vencimento)} · faltam ${-t.diasAtraso} ${t.diasAtraso === -1 ? "dia" : "dias"}`}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="cb-cartao-acoes">
                    <a className="btn-primario" href={link ?? "#"} target="_blank" rel="noopener noreferrer">
                      Abrir no WhatsApp →
                    </a>
                    <button type="button" className="botao-discreto" onClick={() => copiar(d.id, msg)}>
                      {copiado === d.id ? "Copiado" : "Copiar o texto"}
                    </button>
                    <button
                      type="button"
                      className="botao-discreto"
                      aria-expanded={aberto}
                      onClick={() => setAbertos({ ...abertos, [d.id]: !aberto })}
                    >
                      {aberto ? "Fechar o texto" : "Ver e editar o texto"}
                    </button>
                  </div>

                  {aberto ? (
                    <div className="cb-editor">
                      <textarea
                        rows={Math.min(14, msg.split("\n").length + 2)}
                        value={msg}
                        onChange={(e) => setEditadas({ ...editadas, [d.id]: e.target.value })}
                      />
                      {editadas[d.id] !== undefined ? (
                        <button
                          type="button"
                          className="botao-discreto"
                          onClick={() => {
                            const resto = { ...editadas };
                            delete resto[d.id];
                            setEditadas(resto);
                          }}
                        >
                          Voltar ao texto padrão
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>

          {/* ------------------------------------------------- quem não dá para enviar */}
          {leitura.semContato.length ? (
            <section className="cb-lista">
              <h2 className="cb-secao">
                {leitura.semContato.length}{" "}
                {leitura.semContato.length === 1 ? "devedor sem como enviar" : "devedores sem como enviar"}
              </h2>
              <p className="cb-nota">
                Estes <strong>não têm link</strong>, de propósito. Um número errado abre a
                conversa de um desconhecido com uma cobrança já escrita — e isso é pior que
                um dado ruim na planilha. Corrija na origem e traga o arquivo de volta; a
                página não conserta telefone por conta própria.
              </p>
              <table className="cb-recusas">
                <thead>
                  <tr>
                    <th>Quem</th>
                    <th>Está escrito</th>
                    <th>Por que não dá</th>
                    <th>Quanto</th>
                  </tr>
                </thead>
                <tbody>
                  {leitura.semContato.map((d) => (
                    <tr key={d.id}>
                      <td>{d.nome}</td>
                      <td className="cb-mono">{d.telefone.original || "(vazio)"}</td>
                      <td>{d.telefone.motivo}</td>
                      <td className="cb-num">{reais(d.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          {/* --------------------------------------------- linhas que não viraram título */}
          {leitura.descartadas.length ? (
            <section className="cb-lista">
              <h2 className="cb-secao">
                {leitura.descartadas.length}{" "}
                {leitura.descartadas.length === 1 ? "linha não entrou" : "linhas não entraram"}
              </h2>
              <p className="cb-nota">
                O número da linha é o do arquivo aberto no Excel, contando o cabeçalho do
                relatório — dá para ir direto lá.
              </p>
              <table className="cb-recusas">
                <thead>
                  <tr>
                    <th>Linha</th>
                    <th>Por quê</th>
                    <th>Está escrito</th>
                  </tr>
                </thead>
                <tbody>
                  {leitura.descartadas.map((d, i) => (
                    <tr key={i}>
                      <td className="cb-num">{d.linha}</td>
                      <td>{d.motivo}</td>
                      <td className="cb-mono">{d.original}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
