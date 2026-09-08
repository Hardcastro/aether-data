import type { Cor, Peca, Tipo, TipoInfo } from "@/lib/manifesto";
import { GRUPOS, PECAS, TIPOS, gruposComPecasDoTipo, pecasPorTipo } from "@/lib/manifesto";

/**
 * A vitrine é UMA tela, usada três vezes.
 *
 * Decisão dele, 07/08: a home, /sites e /automacoes são exatamente o mesmo
 * Hero — painel que gira no meio, esferas à direita, fundo que troca de cor.
 * Muda só o que está dentro. Na home os cartões são as duas vertentes; clicar
 * numa leva para a mesma tela com as peças daquela vertente.
 *
 * Este arquivo é o tradutor: transforma uma vertente ou uma peça no mesmo
 * formato, para o Hero não precisar saber qual dos dois está mostrando. Sem
 * isso o Hero acumularia condicionais de "se for peça… se for vertente…", que
 * é justamente como uma tela reusada três vezes deixa de ser a mesma tela.
 */
export type ItemVitrine = {
  slug: string;
  nome: string;
  /** Linha em maiúscula acima do nome: o grupo, na peça; a etiqueta, na vertente. */
  etiqueta: string;
  capacidade: string;
  /** Linha curta abaixo da capacidade. Só peça usa, e só quando o manifesto tem. */
  ressalva: string | null;
  cor: Cor;
  /** Print do site rodando. Exclusivo com `mock`. */
  imagem: string | null;
  /** Desenho no lugar do print — só vertente usa, porque vertente não tem tela. */
  mock: Tipo | null;
  /** Chips abaixo da capacidade: a stack, na peça; as competências, na vertente. */
  fichas: string[];
  /**
   * O argumento da peça, aberto sob demanda dentro do painel.
   *
   * Este texto existia desde sempre e só o robô lia: ele saía apenas no bloco
   * `.lista-sem-js`, que é `clip: inset(50%)` — leitor de tela e buscador
   * enxergam, visitante nenhum enxerga. Era o melhor texto do site, invisível.
   *
   * Vertente vem com lista vazia e não desenha nada: vertente é um conjunto,
   * e o argumento mora em cada peça dele.
   */
  porQueExiste: string[];
  acaoPrimaria: { rotulo: string; href: string; externo: boolean };
  acaoSecundaria: { rotulo: string; href: string } | null;
};

export function itemDaPeca(peca: Peca): ItemVitrine {
  return {
    slug: peca.slug,
    nome: peca.nome,
    etiqueta: GRUPOS[peca.grupo].titulo,
    capacidade: peca.capacidade,
    ressalva: peca.ressalva ?? null,
    cor: peca.cor,
    imagem: peca.imagem,
    mock: null,
    fichas: peca.stack,
    porQueExiste: peca.oQueProva,
    /*
      Peça interna mora numa rota deste mesmo site (/nota-fiscal…): abrir aba
      nova para ir de uma página do site a outra é ruído. Só peça externa —
      projeto próprio na Vercel — abre fora.
    */
    acaoPrimaria: {
      rotulo: peca.interna ? "Usar agora →" : "Ver no ar ↗",
      href: peca.url,
      externo: !peca.interna,
    },
    acaoSecundaria: peca.repo ? { rotulo: "Ver código ↗", href: peca.repo } : null,
  };
}

export function itemDaVertente(tipo: TipoInfo): ItemVitrine {
  const pecas = pecasPorTipo(tipo.chave);
  return {
    slug: tipo.chave,
    nome: tipo.titulo,
    etiqueta: tipo.etiqueta,
    capacidade: tipo.chamada,
    // Vertente é um conjunto, não um negócio — não tem o que ressalvar.
    ressalva: null,
    cor: tipo.cor,
    imagem: null,
    mock: tipo.chave,
    // As competências daquela vertente, não a stack: aqui dentro o vocabulário
    // próprio já tem contexto para significar alguma coisa.
    fichas: gruposComPecasDoTipo(tipo.chave).map((g) => g.titulo),
    porQueExiste: [],
    acaoPrimaria: {
      rotulo: `Ver ${pecas.length === 1 ? "a peça" : `as ${pecas.length} peças`} →`,
      href: tipo.rota,
      externo: false,
    },
    acaoSecundaria: null,
  };
}

/** Os dois cartões da home. */
export function itensDaHome(): ItemVitrine[] {
  return (Object.keys(TIPOS) as Tipo[]).map((t) => itemDaVertente(TIPOS[t]));
}

/** Os cartões de uma vitrine de tipo. */
export function itensDoTipo(tipo: Tipo): ItemVitrine[] {
  return pecasPorTipo(tipo).map(itemDaPeca);
}

/** Texto corrido de todas as peças — a lista sem-JS, igual nas três telas. */
export function linhasSemJs(tipo: Tipo | null): string[] {
  const pecas = tipo ? pecasPorTipo(tipo) : PECAS;
  return pecas.map(
    (p) =>
      `${p.nome} — ${p.capacidade}.${p.ressalva ? ` ${p.ressalva}` : ""} ${GRUPOS[p.grupo].titulo}. ${p.stack.join(", ")}. ${p.oQueProva.join(" ")}`
  );
}
