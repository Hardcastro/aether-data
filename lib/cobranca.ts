/**
 * A lista de quem deve vira as mensagens prontas (brief-15).
 *
 * Módulo puro: tipos, leitura de CSV sujo, mapeamento de colunas, crivo de
 * telefone, agrupamento e geração de texto. Nenhuma importação de React,
 * nenhum acesso a rede, nenhum `window`. Serve ao componente de cliente e às
 * conferências do mesmo jeito.
 *
 * Duas regras atravessam o arquivo inteiro:
 *
 * 1. **Campo que o arquivo não traz sai `null`, nunca zero.** Zero é um número
 *    que alguém soma sem perceber; `null` obriga a decidir. Herdado do
 *    `nota-fiscal.ts`, e pelo mesmo motivo.
 * 2. **Nada é consertado em silêncio.** Telefone que não passa no crivo não
 *    vira link; vira uma linha na lista de quem não dá para contatar, com o
 *    motivo escrito e o valor original ao lado. Consertar calado é exatamente
 *    o que o modelo fez com a chave de 45 dígitos em 07/08.
 */

import {
  achatar,
  chutarColunas,
  dataBR,
  dinheiroCsv,
  montarCsv,
  normalizarData,
  normalizarValor,
  reais,
  type Tabela,
} from "./tabela";

/*
  O leitor de tabela suja mora em `lib/tabela.ts` desde 10/08/2026 — foi
  extraído inteiro daqui para a `/conciliacao` herdar, sem nenhuma mudança de
  comportamento. Continua saindo por este módulo para quem já importava dele:
  o componente da /cobranca não precisou de uma linha de alteração.

  **`import` e `export … from` são as duas coisas, e precisam das duas.**
  `export { x } from "./y"` reexporta para quem importa deste módulo e **não**
  cria binding local — as funções continuavam faltando dentro do `agrupar`
  daqui. O `tsc` pegou; o `node --experimental-strip-types` das conferências
  não pegaria, porque ele tira tipo e não confere nada.
*/
export {
  decodificar,
  lerCsv,
  normalizarValor,
  normalizarData,
  hojeISO,
  reais,
  dataBR,
  type Tabela,
} from "./tabela";

/* ------------------------------------------------------------------- tipos */

/** Os cinco campos que a peça precisa achar no CSV de quem chegou. */
export type Campo = "devedor" | "telefone" | "vencimento" | "valor" | "referencia";

export const CAMPOS: Campo[] = ["devedor", "telefone", "vencimento", "valor", "referencia"];

export const CAMPO_ROTULO: Record<Campo, string> = {
  devedor: "Quem deve",
  telefone: "Telefone",
  vencimento: "Vencimento",
  valor: "Valor",
  // Sem "(opcional)" aqui: quem desenha o menu já acrescenta o sufixo a partir
  // de CAMPO_OBRIGATORIO, e o rótulo saía "Documento (opcional) · opcional".
  // O rótulo diz o que o campo é; a obrigatoriedade é outro dado.
  referencia: "Documento",
};

/** `referencia` é o único que pode ficar sem coluna — o resto trava a leitura. */
export const CAMPO_OBRIGATORIO: Record<Campo, boolean> = {
  devedor: true,
  telefone: true,
  vencimento: true,
  valor: true,
  referencia: false,
};

/** Índice da coluna escolhida para cada campo. `-1` é "nenhuma". */
export type Mapa = Record<Campo, number>;

export type Faixa = "a-vencer" | "1-7" | "8-30" | "31-60" | "60+";

export const FAIXAS: Faixa[] = ["a-vencer", "1-7", "8-30", "31-60", "60+"];

export const FAIXA_ROTULO: Record<Faixa, string> = {
  "a-vencer": "A vencer",
  "1-7": "1 a 7 dias",
  "8-30": "8 a 30 dias",
  "31-60": "31 a 60 dias",
  "60+": "mais de 60 dias",
};

/**
 * Resultado do crivo do telefone.
 *
 * `valido` decide se existe link. `aviso` não impede nada — é o caso do fixo,
 * que é um telefone legítimo e provavelmente não tem WhatsApp. Reprovar um
 * fixo seria esconder o devedor; anunciar um link de fixo como se fosse
 * celular seria mentir. As duas coisas cabem porque são campos separados.
 */
export type Telefone = {
  original: string;
  /** Só dígitos, sem o 55 e sem o 0 de operadora. 10 ou 11 posições. */
  digitos: string | null;
  valido: boolean;
  motivo: string | null;
  aviso: string | null;
};

export type Titulo = {
  referencia: string | null;
  /** AAAA-MM-DD, sempre. Qualquer formato de entrada termina aqui. */
  vencimento: string;
  valor: number;
  /** Negativo é "vence daqui a N dias". Vence hoje é 0. */
  diasAtraso: number;
};

export type Devedor = {
  id: string;
  nome: string;
  telefone: Telefone;
  titulos: Titulo[];
  total: number;
  /** A faixa do título mais atrasado — é ela que escolhe o tom da mensagem. */
  faixa: Faixa;
  diasMaiorAtraso: number;
  /**
   * Quando o mesmo nome aparece com telefones diferentes no arquivo. Não é
   * erro do arquivo nem desta peça: é informação que quem cobra precisa ver
   * antes de mandar.
   */
  telefonesConflitantes: string[];
};

export type Descartada = {
  linha: number;
  motivo: string;
  /** O que estava escrito na célula, para a pessoa achar e corrigir na origem. */
  original: string;
};

export type Leitura = {
  devedores: Devedor[];
  /** Devedores cujo telefone reprovou no crivo. Nunca ganham link. */
  semContato: Devedor[];
  /** Linhas que nem chegaram a virar título — data ou valor ilegíveis. */
  descartadas: Descartada[];
  totalArquivo: number;
  linhasLidas: number;
  /** Soma dos devedores + sem contato bate com o total do arquivo. */
  somaConfere: boolean;
};

export type Encargos = {
  ligado: boolean;
  /** Multa única sobre o título, em %. */
  multaPercent: number;
  /** Juros de mora ao mês, em %. Rateados por dia. */
  jurosMesPercent: number;
};

export const ENCARGOS_DESLIGADOS: Encargos = {
  ligado: false,
  multaPercent: 0,
  jurosMesPercent: 0,
};

/**
 * Tetos usuais em venda para consumidor: multa de 2% e juros de 1% ao mês.
 * A peça não impede nada acima disso — ela avisa e manda conferir com quem
 * cuida do contrato, porque ela não conhece o contrato de ninguém. Isso não é
 * parecer jurídico, e a página diz isso com essas palavras.
 */
export const TETO_MULTA = 2;
export const TETO_JUROS_MES = 1;

/* ---------------------------------------------------------------- o mapeador */

/**
 * As palavras que puxam o chute de cada campo, em ordem de força.
 *
 * A ordem importa: `data de vencimento` tem que ganhar de `data`, e `saldo
 * devedor` tem que ir para `valor` e não para `devedor` — por isso o casamento
 * é por palavra inteira e a lista de `valor` é consultada antes.
 */
/** Precedência de consulta do chute — ela é quem decide os empates. */
const ORDEM_DO_CHUTE: Campo[] = ["vencimento", "valor", "telefone", "devedor", "referencia"];

const PISTAS: Record<Campo, string[]> = {
  vencimento: ["vencimento", "vence", "venc", "dt venc", "data venc", "data de vencimento", "due", "due date"],
  valor: ["valor", "vlr", "saldo devedor", "saldo", "valor devido", "valor em aberto", "total", "debito", "montante", "amount"],
  telefone: ["telefone", "celular", "fone", "whatsapp", "whats", "tel", "contato", "phone"],
  devedor: ["cliente", "sacado", "devedor", "nome", "razao social", "razao", "nome do cliente", "pagador", "customer"],
  referencia: ["documento", "doc", "nf", "nota", "titulo", "numero do titulo", "parcela", "pedido", "fatura", "referencia"],
};

/**
 * Chuta as cinco colunas pelo nome do cabeçalho — e o chute é mostrado, não
 * aplicado em silêncio.
 *
 * É aqui que esta peça se separa das duas anteriores. NF-e tem schema, OFX tem
 * especificação; **relatório de contas a receber não tem formato nenhum**, e o
 * mesmo dado chega como `Cliente`, `Sacado` ou `RAZAO_SOCIAL`. Não existe
 * parser possível — existe chute com conferência humana barata.
 *
 * Ordem de consulta deliberada: `vencimento` e `valor` primeiro, porque
 * "saldo devedor" contém "devedor" e "data de vencimento" contém "data".
 * Coluna já tomada não é oferecida de novo.
 */
export function chutarMapa(cabecalho: string[]): Mapa {
  return chutarColunas(cabecalho, PISTAS, CAMPOS, ORDEM_DO_CHUTE);
}

export function mapaCompleto(mapa: Mapa): boolean {
  return CAMPOS.every((c) => !CAMPO_OBRIGATORIO[c] || mapa[c] !== -1);
}

/**
 * Dias entre vencimento e hoje, contados em dia de calendário.
 *
 * `Date.UTC` sobre as três partes, e não `new Date(a) - new Date(b)`: assim a
 * conta não depende de fuso nem de horário de verão, e **vence hoje é 0, não
 * 1**. Um dia a mais joga o devedor para a faixa seguinte e muda o tom da
 * mensagem — é erro visível para quem recebe.
 */
export function diasDeAtraso(vencimento: string, hoje: string): number {
  const [ay, am, ad] = vencimento.split("-").map(Number);
  const [by, bm, bd] = hoje.split("-").map(Number);
  const venc = Date.UTC(ay, am - 1, ad);
  const ref = Date.UTC(by, bm - 1, bd);
  return Math.round((ref - venc) / 86400000);
}

export type Limites = { curto: number; medio: number; longo: number };
export const LIMITES_PADRAO: Limites = { curto: 7, medio: 30, longo: 60 };

export function faixaDe(dias: number, limites: Limites = LIMITES_PADRAO): Faixa {
  if (dias <= 0) return "a-vencer";
  if (dias <= limites.curto) return "1-7";
  if (dias <= limites.medio) return "8-30";
  if (dias <= limites.longo) return "31-60";
  return "60+";
}

/* ----------------------------------------------------- o crivo do telefone */

/**
 * Os DDDs que existem no Brasil. Lista fechada, versionada, não inferida.
 *
 * É o equivalente do módulo 11 da chave de NF-e: um crivo que não pede nada a
 * ninguém e reprova sozinho. Sem ele, `(00) 9999-9999` vira um link que abre a
 * conversa de um desconhecido com um texto de cobrança já escrito — que é o
 * dano real desta categoria de ferramenta, e é pior que dado errado numa
 * planilha, porque é uma acusação de dívida entregue a quem não deve nada.
 *
 * Como todo crivo, é peneira e não garantia: um número com DDD válido pode ser
 * de outra pessoa. Ele elimina o erro grosseiro, não o azar.
 */
export const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

export function avaliarTelefone(bruto: string): Telefone {
  const original = (bruto ?? "").trim();
  const reprovar = (motivo: string): Telefone => ({
    original,
    digitos: null,
    valido: false,
    motivo,
    aviso: null,
  });

  if (!original) return reprovar("campo vazio");

  let d = original.replace(/\D/g, "");
  if (!d) return reprovar("não tem nenhum dígito");

  /*
    Código do país e o 0 de operadora saem antes de qualquer medição — mas o 0
    só sai se o que vem logo atrás for um DDD que existe.

    Sem essa condição, `(00) 99999-8888` perdia o primeiro zero, virava dez
    dígitos e era reprovado por "DDD 09 não existe" — motivo errado para o
    número certo, e um motivo errado manda a pessoa procurar o defeito no lugar
    errado do arquivo dela. Nenhum DDD começa com zero, então a condição nunca
    engole um número legítimo.
  */
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if ((d.length === 11 || d.length === 12) && d.startsWith("0") && DDDS.has(Number(d.slice(1, 3)))) {
    d = d.slice(1);
  }

  if (d.length < 10) {
    return reprovar(
      d.length === 8 || d.length === 9
        ? `${d.length} dígitos — falta o DDD`
        : `só ${d.length} dígito${d.length > 1 ? "s" : ""}`,
    );
  }
  if (d.length > 11) return reprovar(`${d.length} dígitos — número longo demais`);

  const ddd = Number(d.slice(0, 2));
  if (!DDDS.has(ddd)) return reprovar(`DDD ${d.slice(0, 2)} não existe`);

  const assinante = d.slice(2);
  if (/^(\d)\1+$/.test(assinante)) return reprovar("todos os dígitos iguais — é preenchimento, não telefone");

  if (assinante.length === 9) {
    if (assinante[0] !== "9") return reprovar("celular de 9 dígitos que não começa com 9");
    return { original, digitos: d, valido: true, motivo: null, aviso: null };
  }

  // 8 dígitos: fixo. Continua sendo telefone de verdade, e pode não ter
  // WhatsApp — vira aviso no cartão, não reprovação. Reprovar esconderia o
  // devedor; anunciar como celular seria mentir.
  if (assinante[0] === "9") return reprovar("celular sem o nono dígito");
  return {
    original,
    digitos: d,
    valido: true,
    motivo: null,
    aviso: "parece telefone fixo — pode não ter WhatsApp",
  };
}

/* ------------------------------------------------------------- o agrupamento */

/** Chave de agrupamento: nome sem acento, sem caixa e sem espaço duplicado. */
function chaveDevedor(nome: string): string {
  return achatar(nome);
}

/**
 * Do CSV mapeado para os cartões.
 *
 * O agrupamento por devedor não é refinamento — é a especificação. A Serasa
 * mediu, em 2026, **6,6 contas em atraso por micro e pequena empresa
 * inadimplente**: quem cobra não tem uma lista de pessoas, tem uma lista de
 * títulos, e o mesmo nome aparece nela várias vezes. Mandar seis mensagens
 * para a mesma pessoa é o que a mão faz quando cansa, e é o que queima o
 * cliente.
 *
 * A faixa do devedor é a do título **mais atrasado**, não a média nem a do
 * maior valor: é o atraso mais velho que define o tom com que se fala.
 */
export function agrupar(
  tabela: Tabela,
  mapa: Mapa,
  hoje: string,
  limites: Limites = LIMITES_PADRAO,
): Leitura {
  const porChave = new Map<string, Devedor>();
  const descartadas: Descartada[] = [];
  let totalArquivo = 0;

  const celula = (linha: string[], campo: Campo): string =>
    mapa[campo] === -1 ? "" : (linha[mapa[campo]] ?? "").trim();

  tabela.linhas.forEach((linha, i) => {
    const numeroLinha = tabela.numeros[i];

    const nome = celula(linha, "devedor");
    if (!nome) {
      descartadas.push({ linha: numeroLinha, motivo: "sem nome de quem deve", original: "" });
      return;
    }

    const brutoVenc = celula(linha, "vencimento");
    const vencimento = normalizarData(brutoVenc);
    if (!vencimento) {
      descartadas.push({
        linha: numeroLinha,
        motivo: "não entendi a data de vencimento",
        original: brutoVenc || "(vazio)",
      });
      return;
    }

    const brutoValor = celula(linha, "valor");
    const valor = normalizarValor(brutoValor);
    if (valor === null) {
      descartadas.push({
        linha: numeroLinha,
        motivo: "não entendi o valor",
        original: brutoValor || "(vazio)",
      });
      return;
    }
    if (valor <= 0) {
      descartadas.push({
        linha: numeroLinha,
        motivo: "valor zerado ou negativo — título quitado ou crédito",
        original: brutoValor,
      });
      return;
    }

    const titulo: Titulo = {
      referencia: celula(linha, "referencia") || null,
      vencimento,
      valor,
      diasAtraso: diasDeAtraso(vencimento, hoje),
    };

    totalArquivo += valor;

    const chave = chaveDevedor(nome);
    const existente = porChave.get(chave);
    const bruto = celula(linha, "telefone");

    if (existente) {
      existente.titulos.push(titulo);
      // Telefone diferente no mesmo nome não é escolhido em silêncio: o
      // primeiro que passou no crivo continua valendo, e o outro fica à vista.
      if (bruto && bruto !== existente.telefone.original) {
        const outro = avaliarTelefone(bruto);
        if (!existente.telefone.valido && outro.valido) existente.telefone = outro;
        else if (outro.valido && !existente.telefonesConflitantes.includes(bruto)) {
          existente.telefonesConflitantes.push(bruto);
        }
      }
    } else {
      porChave.set(chave, {
        id: chave,
        nome,
        telefone: avaliarTelefone(bruto),
        titulos: [titulo],
        total: 0,
        faixa: "a-vencer",
        diasMaiorAtraso: 0,
        telefonesConflitantes: [],
      });
    }
  });

  const todos = Array.from(porChave.values()).map((d) => {
    d.titulos.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    d.total = d.titulos.reduce((s, t) => s + t.valor, 0);
    d.diasMaiorAtraso = Math.max(...d.titulos.map((t) => t.diasAtraso));
    d.faixa = faixaDe(d.diasMaiorAtraso, limites);
    return d;
  });

  // Mais atrasado primeiro; empate desce pelo valor. É a ordem em que alguém
  // que tem meia hora para cobrar quer atacar a lista.
  const ordenar = (a: Devedor, b: Devedor) =>
    b.diasMaiorAtraso - a.diasMaiorAtraso || b.total - a.total;

  const devedores = todos.filter((d) => d.telefone.valido).sort(ordenar);
  const semContato = todos.filter((d) => !d.telefone.valido).sort(ordenar);

  const somado = todos.reduce((s, d) => s + d.total, 0);

  return {
    devedores,
    semContato,
    descartadas,
    totalArquivo,
    linhasLidas: tabela.linhas.length,
    // Centavo de tolerância: soma de ponto flutuante não fecha na igualdade.
    somaConfere: Math.abs(somado - totalArquivo) < 0.01,
  };
}

/* ---------------------------------------------------------------- o dinheiro */

export type Acrescimo = { multa: number; juros: number; total: number };

/**
 * Multa uma vez sobre o título, juros do mês rateados por dia corrido.
 *
 * Nasce desligado e os campos nascem vazios. **A peça não sabe o que está no
 * contrato de ninguém**, e multa e juros de mora só valem se estiverem
 * previstos em contrato ou na nota — por isso ela nunca preenche um número
 * aqui por conta própria. Título a vencer não acumula nada.
 */
export function acrescimoDe(titulo: Titulo, encargos: Encargos): Acrescimo {
  if (!encargos.ligado || titulo.diasAtraso <= 0) return { multa: 0, juros: 0, total: 0 };
  const multa = titulo.valor * (encargos.multaPercent / 100);
  const juros = titulo.valor * (encargos.jurosMesPercent / 100) * (titulo.diasAtraso / 30);
  return { multa, juros, total: multa + juros };
}

export function totalComEncargos(devedor: Devedor, encargos: Encargos): number {
  return devedor.titulos.reduce((s, t) => s + t.valor + acrescimoDe(t, encargos).total, 0);
}

/* ---------------------------------------------------------------- a mensagem */

export type Textos = Record<Faixa, { abertura: string; fecho: string }>;

/**
 * Os textos padrão, por faixa.
 *
 * Duas regras que não são de estilo: **a peça nunca escreve ameaça** — nem na
 * faixa de mais de 60 dias há menção a protesto, negativação ou nome sujo,
 * porque cobrança vexatória é ilegal e esta peça não vai ser o instrumento. E
 * toda faixa termina abrindo conversa, porque quem está atrasado geralmente
 * está atrasado com todo mundo, e quem responde primeiro recebe primeiro.
 *
 * São padrões, não sentenças: cada um é editável na tela.
 */
export const TEXTOS_PADRAO: Textos = {
  "a-vencer": {
    abertura: "Olá, {nome}! Tudo bem? Passando só para lembrar do que vence em breve:",
    fecho: "Se já tiver pago, pode desconsiderar — pode ser cruzamento de datas. Qualquer dúvida, é só me chamar por aqui.",
  },
  "1-7": {
    abertura: "Olá, {nome}! Tudo bem? Notei que ficou isto em aberto:",
    fecho: "Se você já pagou nos últimos dias, me avisa que eu confirmo e dou baixa. Se ainda não deu, sem problema — me diz quando fica melhor.",
  },
  "8-30": {
    abertura: "Olá, {nome}. Estou passando por causa de um valor que segue em aberto:",
    fecho: "Consegue me dizer uma data em que dá para acertar? Se ficar melhor dividir, a gente vê junto.",
  },
  "31-60": {
    abertura: "Olá, {nome}. Preciso resolver este saldo em aberto com você:",
    fecho: "Me diz o que dá para fazer que eu tento me organizar do meu lado. Prefiro combinar com você a deixar isso parado.",
  },
  "60+": {
    abertura: "Olá, {nome}. Este saldo está em aberto há um tempo e eu preciso encaminhar uma solução:",
    fecho: "Prefiro muito combinar direto com você. Me chama aqui para a gente encontrar um jeito que caiba.",
  },
};

/** Formas jurídicas que ninguém escreve numa mensagem de WhatsApp. */
const SUFIXOS_JURIDICOS = new Set([
  "ltda", "ltda me", "me", "epp", "eireli", "mei", "sa", "s a", "cia", "filial", "matriz", "eirl",
]);

/** Palavras que ficam minúsculas no meio de um nome próprio. */
const PARTICULAS = new Set(["da", "de", "do", "das", "dos", "e", "di", "du", "a", "o"]);

/**
 * Como a mensagem chama quem deve.
 *
 * A primeira versão usava só o primeiro nome, e o exemplo entregou o defeito
 * pronto: `MERCADO DA ESQUINA LTDA` virava **"Olá, Mercado."** — visivelmente
 * quebrado para quem recebe, e o tipo de detalhe que faz alguém desconfiar da
 * ferramenta inteira antes de olhar o valor.
 *
 * Separar pessoa de empresa sem CNPJ na mão é indecidível: "Cafeteria Grão
 * Fino" não tem sufixo nenhum e não é gente. Então a peça não tenta adivinhar —
 * **usa o nome inteiro, tirando só a forma jurídica.** "Olá, José da Silva" é
 * um pouco formal e está certo; "Olá, Mercado" está errado. Entre os dois, o
 * formal ganha sempre.
 *
 * Só reescreve a caixa quando o nome vem TODO EM MAIÚSCULA, que é como sistema
 * antigo guarda. Nome já digitado com caixa mista é respeitado como está — quem
 * cadastrou sabia o que estava escrevendo.
 */
export function tratamento(nome: string): string {
  let palavras = nome.trim().split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return nome;

  // Até dois sufixos no fim: "COMERCIAL X LTDA ME" acontece.
  for (let i = 0; i < 2; i++) {
    if (palavras.length <= 1) break;
    const ultima = achatar(palavras[palavras.length - 1]);
    if (SUFIXOS_JURIDICOS.has(ultima)) palavras = palavras.slice(0, -1);
    else break;
  }

  const juntas = palavras.join(" ");
  if (juntas !== juntas.toUpperCase()) return juntas;

  return palavras
    .map((p, i) => {
      const baixo = p.toLowerCase();
      if (i > 0 && PARTICULAS.has(achatar(p))) return baixo;
      // Preserva o que não é letra na frente: `"DOIS` vira `"Dois`.
      return baixo.replace(/\p{L}/u, (c) => c.toUpperCase());
    })
    .join(" ");
}

/**
 * O texto final de um devedor.
 *
 * Determinístico e sem modelo de linguagem — zero chave, zero custo por uso, e
 * sobretudo: texto de cobrança não pode sair de algo que às vezes inventa um
 * valor. A `/nota-fiscal` já mostrou um modelo normalizar 45 dígitos para 44
 * em silêncio; o mesmo erro aqui é um valor errado cobrado de um cliente.
 */
export function montarMensagem(
  devedor: Devedor,
  textos: Textos,
  encargos: Encargos,
): string {
  const t = textos[devedor.faixa];
  const abertura = t.abertura.replace(/\{nome\}/g, tratamento(devedor.nome));

  const linhas = devedor.titulos.map((titulo) => {
    const ref = titulo.referencia ? `${titulo.referencia} — ` : "";
    const quando =
      titulo.diasAtraso > 0
        ? `venceu em ${dataBR(titulo.vencimento)} (${titulo.diasAtraso} ${titulo.diasAtraso === 1 ? "dia" : "dias"})`
        : titulo.diasAtraso === 0
          ? `vence hoje, ${dataBR(titulo.vencimento)}`
          : `vence em ${dataBR(titulo.vencimento)}`;
    const acrescimo = acrescimoDe(titulo, encargos);
    const valor =
      acrescimo.total > 0
        ? `${reais(titulo.valor)} + ${reais(acrescimo.total)} de encargos`
        : reais(titulo.valor);
    return `• ${ref}${valor} — ${quando}`;
  });

  const total = totalComEncargos(devedor, encargos);
  const fecho = devedor.titulos.length > 1 ? `Total: ${reais(total)}\n\n${t.fecho}` : t.fecho;

  return `${abertura}\n\n${linhas.join("\n")}\n\n${fecho}`;
}

/**
 * O link, e só para quem passou no crivo.
 *
 * `wa.me` com o país na frente, e o texto por `encodeURIComponent` — quebra de
 * linha e acento passam intactos por aí, e é o que mantém a mensagem legível
 * do outro lado. Devolve `null` para telefone reprovado: o chamador não
 * precisa lembrar de checar, porque não há link para esconder.
 */
export function linkWhatsapp(devedor: Devedor, mensagem: string): string | null {
  if (!devedor.telefone.valido || !devedor.telefone.digitos) return null;
  return `https://wa.me/55${devedor.telefone.digitos}?text=${encodeURIComponent(mensagem)}`;
}

/* ------------------------------------------------------------------ o export */

/**
 * CSV de resumo, com `;` e BOM.
 *
 * `;` porque o Excel em português trata vírgula como decimal e joga a linha
 * inteira numa célula só. BOM porque sem ele o mesmo Excel lê como ANSI e o
 * acento morre. As duas coisas são o que faz o arquivo **abrir**, em vez de
 * pedir um passo de importação — mesma decisão já tomada na `/nota-fiscal`.
 */
export function csvResumo(leitura: Leitura, encargos: Encargos): string {
  const cabecalho = [
    "devedor",
    "telefone",
    "titulos",
    "total",
    "total_com_encargos",
    "faixa",
    "dias_maior_atraso",
    "da_para_enviar",
    "motivo",
  ];

  // Sem escapar aqui: `montarCsv` escapa toda célula, e escapar duas vezes
  // transforma `SILVA; CIA` em `"""SILVA; CIA"""` dentro do arquivo. Escape
  // mora num lugar só, e o lugar é o montador.
  const linha = (d: Devedor): string[] =>
    [
      d.nome,
      d.telefone.valido ? d.telefone.digitos! : d.telefone.original,
      String(d.titulos.length),
      dinheiroCsv(d.total),
      dinheiroCsv(totalComEncargos(d, encargos)),
      FAIXA_ROTULO[d.faixa],
      String(d.diasMaiorAtraso),
      d.telefone.valido ? "sim" : "não",
      d.telefone.motivo ?? d.telefone.aviso ?? "",
    ];

  const corpo = [...leitura.devedores, ...leitura.semContato].map(linha);
  return montarCsv(cabecalho, corpo);
}

/** Total por faixa, na ordem declarada — para o resumo e para a conta que fecha. */
export function porFaixa(devedores: Devedor[]): { faixa: Faixa; quantos: number; total: number }[] {
  return FAIXAS.map((faixa) => {
    const dela = devedores.filter((d) => d.faixa === faixa);
    return {
      faixa,
      quantos: dela.length,
      total: dela.reduce((s, d) => s + d.total, 0),
    };
  }).filter((f) => f.quantos > 0);
}
