import { PECAS } from "@/lib/manifesto";

/**
 * Nunca importar este módulo de um arquivo "use client" (nem de nada que um
 * client component importe). VERCEL_PROJECT_PRODUCTION_URL não existe no
 * bundle do cliente — se MARCA vazar para lá, `url` vira localhost:3000 em
 * produção sem erro nenhum no build. Ver seção 5 e 10 do prompt-claude-code-04.
 */
export const MARCA = {
  nome: "AEther Data",
  /*
    A anterior — "Puxo dado de onde ele está e devolvo funcionando." — descrevia
    um pipeline. Verdadeira, e rasa: qualquer ferramenta de integração diz isso,
    e ela não diz nada sobre quem está do outro lado.

    Esta diz primeiro quem escreve e só depois o que sai. É o mesmo fato que
    sustenta o portfólio inteiro — as peças existem porque a operação existe
    antes delas — e ele passou a aparecer no lugar mais visível do site em vez de
    ficar guardado no /sobre.

    Fica no <title> da home, no <meta description> e na primeira linha do Hero.
    Trocar aqui muda os três de uma vez. "Coordeno", e não "dirijo": o cargo é
    encarregado de equipe, e inflar o verbo aqui é o retcon que ele recusa no
    currículo.
  */
  promessa: "Coordeno uma operação de serviços e construo as ferramentas que faltam nela.",
  // Conta as peças de lib/manifesto.ts em vez de escrever o número — a
  // descrição usada no <meta name="description">, og:description e
  // twitter:description ficou dizendo "três peças" com quatro no ar (SEO,
  // 03/08). Contando, ela nunca mais destoa do painel.
  descricao: `Portfólio de automação de rotina com dado e sites que exibem esse dado — ${PECAS.length} peças no ar, agrupadas pela competência que carregam.`,
  url: process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000",
  // Ainda não existem — regra do vazio: campo nulo não desenha o link.
  email: null as string | null,
  whatsapp: null as string | null,
  /*
    Perfis públicos, e não canal de atendimento — a distinção importa e está
    escrita na /contato. Existem para fechar a mão dupla: o README de perfil, o
    currículo e o LinkedIn já apontavam para o hub, e do hub não saía nada.
    Quem chegasse aqui por uma dessas portas não tinha como descobrir de quem
    era o portfólio.

    São independentes de `email`/`whatsapp`: preencher aqueles dois continua
    sendo outra decisão, e apagar estes dois derruba o bloco sozinho.
  */
  linkedin: "https://www.linkedin.com/in/gabriel-barreto-a84650179/" as string | null,
  github: "https://github.com/Hardcastro" as string | null,
  locale: "pt_BR",
} as const;
