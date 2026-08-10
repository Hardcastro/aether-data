"use client";

import { useCallback, useId, useRef, useState } from "react";
import {
  baixarArquivo,
  baixarCsv,
  brl,
  csvPorItem,
  csvPorNota,
  ehRecusa,
  formatarDoc,
  gerarXmlNfe,
  lerXmlNfe,
  nomeDoXml,
  somaConfere,
  type ItemNota,
  type Nota,
  type Recusa,
} from "@/lib/nota-fiscal";

/**
 * Digitalizar e planilhar notas fiscais — brief-12, eixo invertido em 07/08.
 *
 * O processo que a peça automatiza é o da pilha de papel, e o desenho segue os
 * dois verbos do processo, nesta ordem:
 *
 *   foto  →  XML       digitalizar — o papel vira documento estruturado
 *   XML   →  planilha  planilhar   — o documento vira linha de CSV
 *
 * A foto é a entrada. Quem já tem o XML pula o primeiro estágio e entra pelo
 * segundo — é atalho, não o caminho principal, porque nota que já está em XML
 * já foi digitalizada por alguém.
 *
 * Nada do que a foto produz é declarado como exato: o XML gerado sai sem
 * assinatura e sem protocolo, marcado por dentro, e a tabela deixa corrigir
 * campo a campo com a foto original ao lado.
 */

/** Teto de lote. Contenção de custo antes de qualquer chamada sair daqui. */
const MAX_IMAGENS = 10;
const MAX_PAGINAS_PDF = 5;
/** Lado maior da imagem enviada. Acima disto não melhora a leitura, só o custo. */
const LADO_MAX = 1600;

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
 * Tipos mínimos do pdf.js — só o que esta peça usa. Escritos à mão porque a
 * assinatura de `render` mudou entre versões maiores, e um tipo local faz a
 * quebra aparecer numa linha em vez de espalhada pelo componente.
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
 * PDF vira imagem no navegador, e só então sobe. `import()` dinâmico: o pdf.js
 * é a primeira dependência de terceiro do hub e não pode encostar na home nem
 * nas outras rotas. Quem nunca arrastar um PDF nunca baixa esse código.
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

/** "1.234,56" e "1234.56" viram 1234.56. Campo esvaziado vira null, não zero. */
function numeroBr(v: string): number | null {
  const limpo = v.trim();
  if (!limpo) return null;
  const n = Number.parseFloat(limpo.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * O número como ele aparece no campo editável.
 *
 * Sem isto o campo mostrava `87.4` — que é a representação de JavaScript, não
 * um valor que alguém conferindo uma nota reconhece. Numa peça cujo produto é
 * planilha brasileira, ponto decimal e centavo comido são erro de conteúdo, não
 * de estilo. `decimais: null` deixa a quantidade em paz (1 continua "1", 1,5
 * continua "1,5") em vez de virar "1,00".
 */
function paraCampo(v: string | number | null, decimais: number | null): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v !== "number") return String(v);
  return v.toLocaleString("pt-BR", {
    minimumFractionDigits: decimais ?? 0,
    maximumFractionDigits: decimais ?? 4,
  });
}

/* ---------------------------------------------------------------- componente */

export function NotaFiscal({ fotoLigada }: { fotoLigada: boolean }) {
  const [notas, setNotas] = useState<Nota[]>([]);
  /** dataURL da foto que originou cada nota, por id. Só existe para origem imagem. */
  const [imagens, setImagens] = useState<Record<string, string>>({});
  const [recusas, setRecusas] = useState<Recusa[]>([]);
  const [fila, setFila] = useState<Fila>(null);
  const [arrastando, setArrastando] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  const idCampo = useId();
  const entrada = useRef<HTMLInputElement>(null);

  /*
    Vem do servidor como prop, não de um fetch daqui. Antes este componente
    perguntava a `/api/transcrever` depois de montar, o que trazia dois
    problemas: um piscar entre estados, e — pior — o cabeçalho da página, que é
    server component, não tinha como saber e prometia a via de foto mesmo com
    ela desligada.
  */
  const imagemLigada = fotoLigada;

  const engolir = useCallback(
    async (arquivos: File[]) => {
      if (!arquivos.length) return;

      const xmls = arquivos.filter((a) => /\.xml$/i.test(a.name));
      const figuras = arquivos.filter((a) => a.type.startsWith("image/") || /\.pdf$/i.test(a.name));
      const resto = arquivos.filter((a) => !xmls.includes(a) && !figuras.includes(a));

      const novasRecusas: Recusa[] = resto.map((a) => ({
        arquivo: a.name,
        motivo: "não é foto, PDF nem XML",
      }));

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
            motivo: "a leitura de foto não está ligada neste ambiente",
          })),
        );
        setRecusas((r) => [...r, ...novasRecusas]);
        return;
      }

      const aceitas = figuras.slice(0, MAX_IMAGENS);
      novasRecusas.push(
        ...figuras.slice(MAX_IMAGENS).map((a) => ({
          arquivo: a.name,
          motivo: `passou do limite de ${MAX_IMAGENS} fotos por vez`,
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
          const quadros = /\.pdf$/i.test(a.name) ? await pdfParaImagens(a) : [await reduzir(a)];
          for (let p = 0; p < quadros.length; p += 1) {
            const nome = quadros.length > 1 ? `${a.name} (pág. ${p + 1})` : a.name;
            const lido = await transcrever(quadros[p], nome);
            if (ehRecusa(lido)) {
              setRecusas((r) => [...r, lido]);
            } else {
              // A foto fica guardada em memória para a conferência lado a lado.
              // Só nesta sessão — nada é persistido e nada volta ao servidor.
              setImagens((m) => ({ ...m, [lido.id]: quadros[p] }));
              setNotas((n) => [...n, lido]);
            }
          }
        } catch {
          setRecusas((r) => [...r, { arquivo: a.name, motivo: "não consegui abrir este arquivo" }]);
        }
      }
      setFila(null);
    },
    [imagemLigada],
  );

  /**
   * Corrigir um campo apaga a marca "confira" dele — porque a marca quer dizer
   * "o modelo não leu isto com clareza", e depois de um humano olhar a foto e
   * digitar, isso deixou de ser verdade. É a única forma de a marca significar
   * alguma coisa: se ela ficasse para sempre, ninguém olharia.
   */
  function corrigir(id: string, campo: keyof Nota, valor: string | number | null) {
    setNotas((ns) =>
      ns.map((n) =>
        n.id === id
          ? ({ ...n, [campo]: valor, incertos: n.incertos.filter((c) => c !== campo) } as Nota)
          : n,
      ),
    );
  }

  function corrigirItem(id: string, numero: number, campo: keyof ItemNota, valor: string | number | null) {
    setNotas((ns) =>
      ns.map((n) =>
        n.id === id
          ? {
              ...n,
              itens: n.itens.map((i) => (i.numero === numero ? ({ ...i, [campo]: valor } as ItemNota) : i)),
            }
          : n,
      ),
    );
  }

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
    setImagens({});
    setAberta(null);
    if (entrada.current) entrada.current.value = "";
  }

  const totalItens = notas.reduce((t, n) => t + n.itens.length, 0);
  const fotografadas = notas.filter((n) => n.origem === "imagem");
  const porConferir = fotografadas.filter((n) => n.incertos.length).length;
  const ocupado = fila !== null;
  const aceita = imagemLigada ? "image/*,application/pdf,.xml" : ".xml";

  /** Um download por nota, espaçados — o navegador engasga com uma rajada. */
  async function baixarTodosOsXml() {
    for (const n of fotografadas) {
      baixarArquivo(gerarXmlNfe(n), nomeDoXml(n), "application/xml");
      await new Promise((r) => setTimeout(r, 350));
    }
  }

  return (
    <div className="nf">
      {/*
        A ordem deste bloco é a ordem do processo, e ela mudou em 07/08: a foto
        vem primeiro porque é ela a entrada. O XML aparece depois, como o que
        sai — e como atalho para quem já tem.
      */}
      <div className="nf-aviso">
        {imagemLigada ? (
          <p>
            <strong>A foto entra e sobe para ser lida.</strong> Uma figura não tem campo
            nomeado: alguma coisa precisa olhar. Ela é reduzida aqui, enviada para
            transcrição, e não fica guardada em lugar nenhum.
          </p>
        ) : (
          /*
            Falha honesta, e é a mesma regra da S1: quando a entrega não é
            possível, dizer que não é — em vez de sumir e deixar quem chegou
            achando que a peça nunca teve essa via. Some quando a chave existir,
            e aí nenhum visitante vê este parágrafo.
          */
          <p className="nf-desligado">
            <strong>A leitura de foto está desligada neste ambiente.</strong> Falta a
            variável <code>GEMINI_API_KEY</code> no projeto. A via existe e está construída
            — o que você vê abaixo é a peça funcionando pela metade, de propósito, em vez de
            aceitar uma foto e falhar depois de você esperar.
          </p>
        )}
        <p>
          <strong>O XML sai — e, se você já tiver um, ele também entra.</strong> Nota que já
          está em XML não precisa ser lida por ninguém: os campos vêm nomeados dentro do
          arquivo, e esse caminho não sobe nada. É atalho, não o caminho principal.
        </p>
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
          usa teclado chega por Tab e abre com Enter, sem onKeyDown improvisado.
          Arrastar é um extra por cima, não o único caminho.
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
            {imagemLigada ? "Arraste as fotos das notas" : "Arraste os XML das notas"}
          </span>
          <span className="nf-rotulo-fraco">
            {imagemLigada
              ? `ou clique para escolher · PDF e XML também entram · até ${MAX_IMAGENS} fotos por vez`
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

      <div aria-live="polite" className="nf-vivo">
        {fila ? (
          <p className="nf-progresso">
            Lendo <strong>{fila.atual}</strong> — {fila.feito + 1} de {fila.total}
          </p>
        ) : null}
      </div>

      {notas.length || recusas.length ? (
        <>
          <p className="nf-resumo">
            <strong>{notas.length}</strong> {notas.length === 1 ? "nota lida" : "notas lidas"}
            {fotografadas.length ? ` (${fotografadas.length} de foto)` : ""} ·{" "}
            <strong>{totalItens}</strong> {totalItens === 1 ? "item" : "itens"}
            {porConferir ? (
              <>
                {" "}
                · <strong>{porConferir}</strong> {porConferir === 1 ? "pede" : "pedem"} conferência
              </>
            ) : null}
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
                <span className="nf-marca-inline">confira</span> são leituras de foto que o
                modelo não conseguiu ler com clareza. Abra a linha para corrigir com a foto do
                lado.
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
                  <th scope="col">Conferir</th>
                </tr>
              </thead>
              <tbody>
                {notas.map((n) => (
                  <Linha
                    key={n.id}
                    nota={n}
                    foto={imagens[n.id]}
                    aberta={aberta === n.id}
                    alternar={() => setAberta((a) => (a === n.id ? null : n.id))}
                    corrigir={corrigir}
                    corrigirItem={corrigirItem}
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
              Baixar planilha — uma linha por nota
            </button>
            <button
              type="button"
              className="btn-secundario"
              onClick={() => baixarCsv(csvPorItem(notas), "itens.csv")}
              disabled={totalItens === 0}
            >
              Uma linha por item
            </button>
            {fotografadas.length ? (
              <button type="button" className="btn-secundario" onClick={baixarTodosOsXml}>
                Baixar {fotografadas.length} XML {fotografadas.length === 1 ? "gerado" : "gerados"}
              </button>
            ) : null}
          </div>

          <p className="nf-nota-csv">
            A planilha leva a coluna <code>origem</code> e a coluna <code>conferir</code>{" "}
            junto — a marca precisa sobreviver ao arquivo, senão não serve para nada.{" "}
            {fotografadas.length ? (
              <>
                O XML gerado de foto sai <strong>sem assinatura e sem protocolo da SEFAZ</strong>,
                com um aviso escrito dentro dele e nome começando em <code>transcrito-</code>.
                Ele serve para importar, não para provar.
              </>
            ) : null}
          </p>
        </>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------------- linha */

function Linha({
  nota,
  foto,
  aberta,
  alternar,
  corrigir,
  corrigirItem,
}: {
  nota: Nota;
  foto?: string;
  aberta: boolean;
  alternar: () => void;
  corrigir: (id: string, campo: keyof Nota, valor: string | number | null) => void;
  corrigirItem: (id: string, numero: number, campo: keyof ItemNota, valor: string | number | null) => void;
}) {
  const duvidoso = (campo: string) => nota.incertos.includes(campo);
  const confere = somaConfere(nota);
  // Só o que veio de foto é editável. Um campo de XML é o que está escrito no
  // documento — deixar corrigir ali seria deixar reescrever a nota fiscal.
  const editavel = nota.origem === "imagem";

  const celula = (campo: string, conteudo: React.ReactNode, classe?: string) => (
    <td
      className={[classe, duvidoso(campo) ? "duvida" : null].filter(Boolean).join(" ") || undefined}
      title={classe === "col-nome" && typeof conteudo === "string" ? conteudo : undefined}
    >
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
            {nota.origem === "xml" ? "XML" : "FOTO"}
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
        <td>
          <button type="button" className="nf-abrir" onClick={alternar} aria-expanded={aberta}>
            {nota.incertos.length ? `${nota.incertos.length} campo${nota.incertos.length > 1 ? "s" : ""}` : "abrir"}{" "}
            {aberta ? "▾" : "▸"}
          </button>
        </td>
      </tr>

      {aberta ? (
        <tr className="nf-detalhe">
          <td colSpan={8}>
            <div className={foto ? "nf-conferir com-foto" : "nf-conferir"}>
              {foto ? (
                <figure className="nf-foto">
                  {/*
                    <img> e não next/image: a fonte é um dataURL gerado no
                    navegador nesta sessão, que o otimizador de imagem do Next
                    não tem como processar — ele opera sobre URLs que o
                    servidor consegue buscar.
                  */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={foto} alt={`Foto de ${nota.arquivo}`} />
                  <figcaption>
                    A foto que gerou esta linha. Confira campo a campo — o que estiver
                    marcado é o que o modelo leu com dúvida.
                  </figcaption>
                </figure>
              ) : null}

              <div className="nf-campos">
                {editavel ? (
                  <p className="nf-campos-titulo">
                    Corrigir apaga a marca — a marca quer dizer &quot;o modelo não leu isto com
                    clareza&quot;, e depois que você olhou a foto isso deixou de ser verdade.
                  </p>
                ) : (
                  <p className="nf-campos-titulo">
                    Veio de XML: os campos são o que está escrito no documento, e por isso
                    não são editáveis aqui.
                  </p>
                )}

                <div className="nf-grade">
                  <Campo nota={nota} campo="documento" rotulo="Documento" editavel={editavel} corrigir={corrigir} />
                  <Campo nota={nota} campo="chave" rotulo="Chave de acesso" editavel={editavel} corrigir={corrigir} />
                  <Campo nota={nota} campo="numero" rotulo="Número" editavel={editavel} corrigir={corrigir} />
                  <Campo nota={nota} campo="serie" rotulo="Série" editavel={editavel} corrigir={corrigir} />
                  <Campo nota={nota} campo="emissao" rotulo="Emissão" editavel={editavel} corrigir={corrigir} />
                  <Campo nota={nota} campo="emitenteNome" rotulo="Emitente" editavel={editavel} corrigir={corrigir} />
                  <Campo nota={nota} campo="emitenteCnpj" rotulo="CNPJ do emitente" editavel={editavel} corrigir={corrigir} />
                  <Campo nota={nota} campo="destinatarioNome" rotulo="Destinatário" editavel={editavel} corrigir={corrigir} />
                  <Campo nota={nota} campo="destinatarioDoc" rotulo="Doc. do destinatário" editavel={editavel} corrigir={corrigir} />
                  <Campo nota={nota} campo="valorProdutos" rotulo="Produtos" numerico editavel={editavel} corrigir={corrigir} />
                  <Campo nota={nota} campo="valorFrete" rotulo="Frete" numerico editavel={editavel} corrigir={corrigir} />
                  <Campo nota={nota} campo="valorIcms" rotulo="ICMS" numerico editavel={editavel} corrigir={corrigir} />
                  <Campo nota={nota} campo="valorTotal" rotulo="Total" numerico editavel={editavel} corrigir={corrigir} />
                </div>

                {confere === false ? (
                  <p className="nf-alerta">
                    A soma dos itens não bate com o valor de produtos declarado. Numa leitura
                    de foto, isso costuma ser um item transcrito errado — vale conferir os dois
                    contra a imagem.
                  </p>
                ) : null}

                {nota.itens.length ? (
                  <table className="nf-itens">
                    <thead>
                      <tr>
                        <th scope="col">#</th>
                        <th scope="col">Descrição</th>
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
                          <td>
                            <CampoItem
                              valor={i.descricao}
                              rotulo={`Descrição do item ${i.numero}`}
                              editavel={editavel}
                              aoMudar={(v) => corrigirItem(nota.id, i.numero, "descricao", v)}
                            />
                          </td>
                          <td className="num">
                            <CampoItem
                              valor={i.quantidade}
                              numerico
                              decimais={null}
                              rotulo={`Quantidade do item ${i.numero}`}
                              editavel={editavel}
                              aoMudar={(v) => corrigirItem(nota.id, i.numero, "quantidade", v)}
                            />
                          </td>
                          <td className="num">
                            <CampoItem
                              valor={i.valorUnitario}
                              numerico
                              rotulo={`Valor unitário do item ${i.numero}`}
                              editavel={editavel}
                              aoMudar={(v) => corrigirItem(nota.id, i.numero, "valorUnitario", v)}
                            />
                          </td>
                          <td className="num">
                            <CampoItem
                              valor={i.valorTotal}
                              numerico
                              rotulo={`Valor total do item ${i.numero}`}
                              editavel={editavel}
                              aoMudar={(v) => corrigirItem(nota.id, i.numero, "valorTotal", v)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}

                {editavel ? (
                  <button
                    type="button"
                    className="calc-reset"
                    onClick={() => baixarArquivo(gerarXmlNfe(nota), nomeDoXml(nota), "application/xml")}
                  >
                    Baixar o XML desta nota
                  </button>
                ) : null}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

/* --------------------------------------------------------------------- campo */

function Campo({
  nota,
  campo,
  rotulo,
  numerico,
  editavel,
  corrigir,
}: {
  nota: Nota;
  campo: keyof Nota;
  rotulo: string;
  numerico?: boolean;
  editavel: boolean;
  corrigir: (id: string, campo: keyof Nota, valor: string | number | null) => void;
}) {
  const bruto = nota[campo] as string | number | null;
  const duvida = nota.incertos.includes(campo as string);
  const id = useId();

  const texto = paraCampo(bruto, numerico ? 2 : null);

  if (!editavel) {
    return (
      <div className="nf-campo">
        <span className="nf-campo-rotulo">{rotulo}</span>
        <span className="nf-campo-valor">
          {texto === "" ? <span className="nf-vazio">—</span> : texto}
        </span>
      </div>
    );
  }

  return (
    <div className={`nf-campo${duvida ? " duvida" : ""}`}>
      <label className="nf-campo-rotulo" htmlFor={id}>
        {rotulo}
        {duvida ? <span className="nf-marca-inline"> confira</span> : null}
      </label>
      <input
        id={id}
        type="text"
        inputMode={numerico ? "decimal" : undefined}
        defaultValue={texto}
        placeholder="não lido"
        // onBlur e não onChange: a marca "confira" só sai quando a pessoa
        // termina de digitar. Apagando a cada tecla, ela sumiria no primeiro
        // caractere e o campo pareceria conferido no meio da correção.
        onBlur={(e) => corrigir(nota.id, campo, numerico ? numeroBr(e.target.value) : e.target.value || null)}
      />
    </div>
  );
}

function CampoItem({
  valor,
  numerico,
  /** null = não força casas (quantidade). 2 = dinheiro. */
  decimais = 2,
  rotulo,
  editavel,
  aoMudar,
}: {
  valor: string | number | null;
  numerico?: boolean;
  decimais?: number | null;
  rotulo: string;
  editavel: boolean;
  aoMudar: (v: string | number | null) => void;
}) {
  if (!editavel) {
    return valor === null ? (
      <span className="nf-vazio">—</span>
    ) : (
      <>{typeof valor === "number" && numerico ? brl.format(valor) : valor}</>
    );
  }
  return (
    <input
      className="nf-item-input"
      type="text"
      inputMode={numerico ? "decimal" : undefined}
      defaultValue={paraCampo(valor, numerico ? decimais : null)}
      placeholder="—"
      aria-label={rotulo}
      onBlur={(e) => aoMudar(numerico ? numeroBr(e.target.value) : e.target.value || null)}
    />
  );
}
