import { PECAS } from "@/lib/manifesto";

/**
 * O fundo que passeia sozinho pela paleta inteira.
 *
 * Por que existe: até 06/08 sempre havia uma peça selecionada, e a cor do
 * fundo vinha dela. Com a home e as duas vitrines em estado de grade, existem
 * telas sem peça aberta — e sem isto elas herdariam o verde da peça padrão,
 * parado, que é a tela mais sem graça possível justamente na porta de entrada.
 *
 * O padrão que isso cria, e que vale manter: **cor passeando = nada
 * escolhido; cor firme = peça aberta.** A transição entre os dois estados é a
 * recompensa de clicar.
 *
 * Sem JS: são keyframes puros, gerados no servidor a partir de PECAS. Peça
 * nova entra no ciclo por commit no manifesto, como tudo o mais.
 */
export function FundoCiclico() {
  const cores = PECAS.map((p) => p.cor);

  /*
    Custom property só interpola em @keyframes se for registrada com @property
    e sintaxe <color> — sem isso o navegador trata como token opaco e troca de
    cor no meio do passo, em corte seco. Onde @property não existe (Firefox
    < 128), é exatamente isso que acontece: o ciclo vira corte a cada passo em
    vez de degradê. Feio, não quebrado — e a `transition: background` que já
    está no body suaviza parte disso de graça.
  */
  const registro = (["inner", "mid", "outer"] as const)
    .map(
      (n, i) => `@property --bg-${n}{syntax:"<color>";inherits:true;initial-value:${
        [cores[0].inner, cores[0].mid, cores[0].outer][i]
      }}`
    )
    .join("");

  // Um passo por peça, mais a repetição da primeira no fim para o ciclo fechar
  // sem salto. 12s por peça: lento o suficiente para não competir com a
  // leitura, rápido o suficiente para alguém perceber que mexe.
  const passos = [...cores, cores[0]];
  const total = cores.length * 12;
  const quadros = passos
    .map((cor, i) => {
      const pct = ((i / (passos.length - 1)) * 100).toFixed(4);
      return `${pct}%{--bg-inner:${cor.inner};--bg-mid:${cor.mid};--bg-outer:${cor.outer}}`;
    })
    .join("");

  return (
    <style>{
      `${registro}` +
      `@keyframes ciclo-fundo{${quadros}}` +
      /*
        `:root:root` dobra a especificidade de propósito — mesmo motivo
        documentado em app/page.tsx: o React 19 iça <style> para o <head> sem
        garantir que caia depois do globals.css.

        A regra de peça aberta usa três repetições (`:root:root:root`) para
        vencer esta aqui por especificidade em vez de por ordem de montagem,
        que não é garantida durante a navegação de cliente entre grade e peça.
      */
      `@media (prefers-reduced-motion:no-preference){:root:root{animation:ciclo-fundo ${total}s linear infinite}}`
    }</style>
  );
}
