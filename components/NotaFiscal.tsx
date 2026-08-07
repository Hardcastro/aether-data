"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  baixarCsv,
  brl,
  csvPorItem,
  csvPorNota,
  ehRecusa,
  formatarDoc,
  lerXmlNfe,
  somaConfere,
  type Nota,
  type Recusa,
} from "@/lib/nota-fiscal";

/**
 * A nota fiscal vira linha de planilha — brief-12 e o adendo de 07/08.
 *
 * Duas vias, e a diferença entre elas é a peça:
 *
 *   XML   → lido aqui mesmo, com DOMParser. Não sobe. Os campos já vêm
 *           nomeados no arquivo, então não há inferência nenhuma no caminho.
 *   IMAGEM→ sobe para /api/transcrever, porque uma figura não tem campo
 *           nomeado e alguma coisa precisa olhar.
 *
 * Toda linha carrega de onde veio, na tela e no CSV. O que a via de imagem
 * escreveu sem conseguir ler direito aparece marcado — ver `incertos`.
 */

/** Teto de lote. Contenção de custo antes de qualquer chamada sair daqui. */
const MAX_IMAGENS = 10;
const MAX_PAGINAS_PDF = 5;
/** Lado maior da imagem enviada. Acima disto não melhora a leitura, só o custo. */
const LADO_MAX = 1600;

/**
 * Sintéticos e versionados, no mesmo padrão zero-config da S2. Sem eles,
 * metade de quem chega vê uma tela vazia e sai — nem todo visitante tem uma
 * nota à mão na hora.
 *
 * Os dois não são iguais de propósito: um traz o envelope <nfeProc> com
 * protocolo e destinatário com CNPJ, o outro vem como <NFe> nua com CPF no
 * destinatário. São os dois caminhos que quebram parser ingênuo.
 */
const EXEMPLOS = ["exemplo-nfe-mercadoria.xml", "exemplo-nfe-consumidor.xml"];

type Fila = { total: number; feito: number; atual: string } | null;

/* ------------------------------------------------------------------ imagem */

async function reduzir(fonte: Blob): Promise<string> {
  const bitmap = await createImageBitmap(fonte);
  const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
  const largura = Math.round(bitmap.width * escala);
  const altura = Math.round(bitmap.height * escala);
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas indisponível");
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

/**
 * Tipos mínimos do pdf.js — só o que esta peça usa.
 *
 * Escritos à mão em vez de importar os tipos do pacote por um motivo prático:
 * a assinatura de `render` mudou entre versões maiores, e um tipo local que
 * descreve a chamada real deixa a quebra aparecer aqui, numa linha, em vez de
 * espalhada pelo componente.
 */
type PdfPagina = {
  getViewport(o: { scale: number }): { width: number; height: number };
  render(o: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
    canvas: HTMLCanvasElement;
  }): { promise: Promise<void> };
};
type PdfDoc = { numPages: number; getPage(n: number): Promise<PdfPagina> };
type PdfLib = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(o: { data: ArrayBuffer }): { promise: Promise<PdfDoc> };
};

/**
 * PDF vira imagem no navegador, e só então sobe.
 *
 * `import()` dinâmico: o pdf.js é a primeira dependência de terceiro do hub e
 * ela não pode encostar na home nem nas outras rotas. Quem nunca arrastar um
 * PDF nunca baixa esse código.
 */
async function pdfParaImagens(arquivo: File): Promise<string[]> {
  const pdfjs = (await import("pdfjs-dist")) as unknown as PdfLib;
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const doc = await pdfjs.getDocument({ data: await arquivo.arrayBuffer() }).promise;
  const imagens: string[] = [];
  const paginas = Math.min(doc.numPages, MAX_PAGINAS_PDF);
  for (let i = 1; i <= paginas; i += 1) {
    const pagina = await doc.getPage(i);
    // scale 2 porque DANFE tem campo de 6pt: em scale 1 o modelo lê o layout e
    // erra o dígito.
    const viewport = pagina.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas indisponível");
    await pagina.render({ canvasContext: ctx, viewport, canvas }).promise;
    imagens.push(canvas.toDataURL("image/jpeg", 0.85));
  }
  return imagens;
}

let sequenciaImagem = 0;

async function transcrever(imagem: string, arquivo: string): Promise<Nota | Recusa> {
  const r = await fetch("/api/transcrever", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ imagem, arquivo }),
  });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) return { arquivo, motivo: dados?.erro ?? "a leitura falhou" };

  const n = dados.nota ?? {};
  sequenciaImagem += 1;
  return {
    id: `i${sequenciaImagem}`,
    arquivo,
    origem: "imagem",
    documento: n.documento ?? null,
    chave: n.chave ?? null,
    numero: n.numero ?? null,
    serie: n.serie ?? null,
    emissao: n.emissao ?? null,
    emitenteNome: n.emitenteNome ?? null,
    emitenteCnpj: n.emitenteCnpj ?? null,
    destinatarioNome: n.destinatarioNome ?? null,
    destinatarioDoc: n.destinatarioDoc ?? null,
    valorProdutos: n.valorProdutos ?? null,
    valorFrete: n.valorFrete ?? null,
    valorIcms: n.valorIcms ?? null,
    valorTotal: n.valorTotal ?? null,
    itens: Array.isArray(n.itens) ? n.itens : [],
    incertos: Array.isArray(n.incertos) ? n.incertos : [],
  };
}

/* ---------------------------------------------------------------- componente */

export function NotaFiscal() {
  const [notas, setNotas] = useState<Nota[]>([]);
  const [recusas, setRecusas] = useState<Recusa[]>([]);
  const [fila, setFila] = useState<Fila>(null);
  const [arrastando, setArrastando] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  /** null enquanto não perguntamos. A via de imagem só é anunciada se existir. */
  const [imagemLigada, setImagemLigada] = useState<boolean | null>(null);
  const idCampo = useId();
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/transcrever")
      .then((r) => r.json())
      .then((d) => vivo && setImagemLigada(Boolean(d?.ligado)))
      .catch(() => vivo && setImagemLigada(false));
    return () => {
      vivo = false;
    };
  }, []);

  const engolir = useCallback(
    async (arquivos: File[]) => {
      if (!arquivos.length) return;

      const xmls = arquivos.filter((a) => /\.xml$/i.test(a.name));
      const figuras = arquivos.filter((a) => a.type.startsWith("image/") || /\.pdf$/i.test(a.name));
      const resto = arquivos.filter((a) => !xmls.includes(a) && !figuras.includes(a));

      const novasRecusas: Recusa[] = resto.map((a) => ({
        arquivo: a.name,
        motivo: "não é XML, imagem nem PDF",
      }));

      // XML primeiro: é síncrono e barato, então a tabela já aparece preenchida
      // enquanto as imagens ainda estão na fila.
      const novasNotas: Nota[] = [];
      for (const a of xmls) {
        const lido = lerXmlNfe(await a.text(), a.name);
        if (ehRecusa(lido)) novasRecusas.push(lido);
        else novasNotas.push(lido);
      }
      setNotas((n) => [...n, ...novasNotas]);

      if (figuras.length && !imagemLigada) {
        novasRecusas.push(
          ...figuras.map((a) => ({
            arquivo: a.name,
            motivo: "a leitura de imagem não está ligada neste ambiente",
          })),
        );
        setRecusas((r) => [...r, ...novasRecusas]);
        return;
      }

      const aceitas = figuras.slice(0, MAX_IMAGENS);
      novasRecusas.push(
        ...figuras.slice(MAX_IMAGENS).map((a) => ({
          arquivo: a.name,
          motivo: `passou do limite de ${MAX_IMAGENS} imagens por vez`,
        })),
      );
      setRecusas((r) => [...r, ...novasRecusas]);
      if (!aceitas.length) return;

      // Serial, não em paralelo: dá progresso por arquivo, respeita o limite
      // por minuto da rota, e uma foto ruim não derruba as outras nove.
      setFila({ total: aceitas.length, feito: 0, atual: aceitas[0].name });
      for (let i = 0; i < aceitas.length; i += 1) {
        const a = aceitas[i];
        setFila({ total: aceitas.length, feito: i, atual: a.name });
        try {
          const imagens = /\.pdf$/i.test(a.name) ? await pdfParaImagens(a) : [await reduzir(a)];
          for (let p = 0; p < imagens.length; p += 1) {
            const nome = imagens.length > 1 ? `${a.name} (pág. ${p + 1})` : a.name;
            const lido = await transcrever(imagens[p], nome);
            if (ehRecusa(lido)) setRecusas((r) => [...r, lido]);
            else setNotas((n) => [...n, lido]);
          }
        } catch {
          setRecusas((r) => [...r, { arquivo: a.name, motivo: "não consegui abrir este arquivo" }]);
        }
      }
      setFila(null);
    },
    [imagemLigada],
  );

  async function carregarExemplos() {
    const lidos = await Promise.all(
      EXEMPLOS.map(async (arquivo) => {
        const r = await fetch(`/exemplos/${arquivo}`);
        return lerXmlNfe(await r.text(), arquivo);
      }),
    );
    setNotas((n) => [...n, ...lidos.filter((l): l is Nota => !ehRecusa(l))]);
  }

  function limpar() {
    setNotas([]);
    setRecusas([]);
    setAberta(null);
    if (entrada.current) entrada.current.value = "";
  }

  const totalItens = notas.reduce((t, n) => t + n.itens.length, 0);
  const transcritas = notas.filter((n) => n.origem === "imagem").length;
  const ocupado = fila !== null;

  const aceita = imagemLigada ? ".xml,image/*,application/pdf" : ".xml";

  return (
    <div className="nf">
      {/*
        A explicação vem antes do campo, não no rodapé. É o único jeito de a
        peça não mentir: uma das vias sobe o arquivo e a outra não, e quem vai
        arrastar uma nota real tem o direito de saber qual é qual antes de
        soltar.
      */}
      <div className="nf-aviso">
        <p>
          <strong>O XML não sai do seu navegador.</strong> Ele já tem os campos nomeados
          dentro dele, então ler é trabalho de leitor de XML — não precisa de servidor, e
          não usa nenhum.
        </p>
        {imagemLigada ? (
          <p>
            <strong>A imagem sobe para ser lida.</strong> Uma foto não tem campo nomeado:
            alguma coisa precisa olhar a figura. Ela é reduzida aqui, enviada para
            transcrição e não fica guardada em lugar nenhum.
          </p>
        ) : null}
      </div>

      <div
        className={`nf-solta${arrastando ? " arrastando" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          engolir(Array.from(e.dataTransfer.files));
        }}
      >
        {/*
          O <input> é o controle de verdade e o <label> é a área inteira: quem
          usa teclado chega no campo por Tab e abre com Enter, sem nenhum
          onKeyDown improvisado. O arrastar é um extra por cima, não o único
          caminho.
        */}
        <input
          ref={entrada}
          id={idCampo}
          className="nf-entrada"
          type="file"
          multiple
          accept={aceita}
          disabled={ocupado}
          onChange={(e) => engolir(Array.from(e.target.files ?? []))}
        />
        <label htmlFor={idCampo} className="nf-rotulo">
          <span className="nf-rotulo-forte">
            {imagemLigada
              ? "Arraste XML, foto ou PDF de nota"
              : "Arraste os XML das notas"}
          </span>
          <span className="nf-rotulo-fraco">
            {imagemLigada
              ? `ou clique para escolher · até ${MAX_IMAGENS} imagens por vez`
              : "ou clique para escolher · vários de uma vez"}
          </span>
        </label>
      </div>

      <div className="nf-atalhos">
        <button type="button" className="calc-reset" onClick={carregarExemplos} disabled={ocupado}>
          Não tenho nota agora — carregar exemplos
        </button>
        {notas.length || recusas.length ? (
          <button type="button" className="calc-reset" onClick={limpar} disabled={ocupado}>
            Limpar
          </button>
        ) : null}
      </div>

      {/* Progresso audível: quem não vê a barra ouve o arquivo que está saindo. */}
      <div aria-live="polite" className="nf-vivo">
        {fila ? (
          <p className="nf-progresso">
            Lendo <strong>{fila.atual}</strong> — {fila.feito + 1} de {fila.total}
          </p>
        ) : null}
      </div>

      {notas.length || recusas.length ? (
        <>
          {/*
            O resumo do lote antes da tabela. Quem arrasta 40 arquivos precisa
            saber que 3 não entraram sem ter que procurar.
          */}
          <p className="nf-resumo">
            <strong>{notas.length}</strong>{" "}
            {notas.length === 1 ? "nota lida" : "notas lidas"}
            {transcritas ? ` (${transcritas} por imagem)` : ""} · <strong>{totalItens}</strong>{" "}
            {totalItens === 1 ? "item" : "itens"}
            {recusas.length ? (
              <>
                {" "}
                · <strong>{recusas.length}</strong> não {recusas.length === 1 ? "entrou" : "entraram"}
              </>
            ) : null}
          </p>

          {recusas.length ? (
            <ul className="nf-recusas">
              {recusas.map((r, i) => (
                <li key={`${r.arquivo}-${i}`}>
                  <strong>{r.arquivo}</strong> — {r.motivo}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}

      {notas.length ? (
        <>
          <div className="nf-tabela-rolo">
            <table className="nf-tabela">
              <caption className="nf-legenda">
                Uma linha por nota. A coluna <strong>origem</strong> diz de onde veio cada
                uma — e as células marcadas com{" "}
                <span className="nf-marca-inline">confira</span> são leituras de imagem que o
                modelo não conseguiu ler com clareza.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Origem</th>
                  <th scope="col">Documento</th>
                  <th scope="col">Número</th>
                  <th scope="col">Emissão</th>
                  <th scope="col">Emitente</th>
                  <th scope="col">CNPJ</th>
                  <th scope="col" className="num">
                    Total
                  </th>
                  <th scope="col" className="num">
                    Itens
                  </th>
                </tr>
              </thead>
              <tbody>
                {notas.map((n) => (
                  <Linha
                    key={n.id}
                    nota={n}
                    aberta={aberta === n.id}
                    alternar={() => setAberta((a) => (a === n.id ? null : n.id))}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="nf-exportar">
            <button
              type="button"
              className="btn-primario"
              onClick={() => baixarCsv(csvPorNota(notas), "notas.csv")}
            >
              Baixar CSV — uma linha por nota
            </button>
            <button
              type="button"
              className="btn-secundario"
              onClick={() => baixarCsv(csvPorItem(notas), "itens.csv")}
              disabled={totalItens === 0}
            >
              Baixar CSV — uma linha por item
            </button>
          </div>
          <p className="nf-nota-csv">
            Os dois arquivos levam a coluna <code>origem</code> e a coluna{" "}
            <code>conferir</code> junto. A marca precisa sobreviver à planilha — se ela só
            existisse na tela, não serviria para nada.
          </p>
        </>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------------- linha */

function Linha({
  nota,
  aberta,
  alternar,
}: {
  nota: Nota;
  aberta: boolean;
  alternar: () => void;
}) {
  const duvidoso = (campo: string) => nota.incertos.includes(campo);
  const confere = somaConfere(nota);

  const celula = (campo: string, conteudo: React.ReactNode, classe?: string) => (
    <td
      className={[classe, duvidoso(campo) ? "duvida" : null].filter(Boolean).join(" ") || undefined}
      // A razão social é cortada com reticências na tabela para a coluna de
      // valor caber. O texto inteiro continua aqui e no CSV — cortar na tela
      // não pode virar cortar o dado.
      title={classe === "col-nome" && typeof conteudo === "string" ? conteudo : undefined}
    >
      {/*
        O corte precisa de um bloco de verdade por dentro da célula: com
        `table-layout: auto`, `max-width` num <td> é sugestão e o navegador
        estica a coluna assim mesmo. Foi o que jogou a coluna de valor para
        fora da área visível na primeira captura.
      */}
      {conteudo === null || conteudo === undefined ? (
        <span className="nf-vazio">—</span>
      ) : classe === "col-nome" ? (
        <span className="nome">{conteudo}</span>
      ) : (
        conteudo
      )}
      {duvidoso(campo) ? <span className="nf-marca">confira</span> : null}
    </td>
  );

  return (
    <>
      <tr className={nota.origem === "imagem" ? "de-imagem" : undefined}>
        <td>
          <span className={`nf-origem ${nota.origem}`}>
            {nota.origem === "xml" ? "XML" : "IMAGEM"}
          </span>
        </td>
        {celula("documento", nota.documento)}
        {celula("numero", nota.numero)}
        {celula("emissao", nota.emissao)}
        {celula("emitenteNome", nota.emitenteNome, "col-nome")}
        {celula("emitenteCnpj", formatarDoc(nota.emitenteCnpj))}
        <td className={`num${duvidoso("valorTotal") ? " duvida" : ""}`}>
          {nota.valorTotal === null ? (
            <span className="nf-vazio">—</span>
          ) : (
            brl.format(nota.valorTotal)
          )}
          {duvidoso("valorTotal") ? <span className="nf-marca">confira</span> : null}
        </td>
        <td className="num">
          {nota.itens.length ? (
            <button
              type="button"
              className="nf-abrir"
              onClick={alternar}
              aria-expanded={aberta}
            >
              {nota.itens.length} {aberta ? "▾" : "▸"}
            </button>
          ) : (
            <span className="nf-vazio">—</span>
          )}
        </td>
      </tr>

      {aberta ? (
        <tr className="nf-detalhe">
          <td colSpan={8}>
            {/*
              A soma dos itens contra o total de produtos. Numa nota vinda de
              XML ela fecha sempre; numa transcrição, é o aviso mais barato de
              que um item saiu errado da leitura.
            */}
            {confere === false ? (
              <p className="nf-alerta">
                A soma dos itens não bate com o valor de produtos declarado. Numa leitura de
                imagem, isso costuma ser um item transcrito errado.
              </p>
            ) : null}
            <table className="nf-itens">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Descrição</th>
                  <th scope="col">NCM</th>
                  <th scope="col" className="num">
                    Qtd
                  </th>
                  <th scope="col" className="num">
                    Unitário
                  </th>
                  <th scope="col" className="num">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {nota.itens.map((i) => (
                  <tr key={`${nota.id}-${i.numero}`}>
                    <td>{i.numero}</td>
                    <td>{i.descricao ?? <span className="nf-vazio">—</span>}</td>
                    <td>{i.ncm ?? <span className="nf-vazio">—</span>}</td>
                    <td className="num">{i.quantidade ?? <span className="nf-vazio">—</span>}</td>
                    <td className="num">
                      {i.valorUnitario === null ? (
                        <span className="nf-vazio">—</span>
                      ) : (
                        brl.format(i.valorUnitario)
                      )}
                    </td>
                    <td className="num">
                      {i.valorTotal === null ? (
                        <span className="nf-vazio">—</span>
                      ) : (
                        brl.format(i.valorTotal)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      ) : null}
    </>
  );
}
