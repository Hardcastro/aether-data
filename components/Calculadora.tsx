"use client";

import { useId, useState } from "react";

/**
 * Calculadora de custo do processo manual — brief-10.
 *
 * A regra da peça é que a conta fica aberta: os três fatores aparecem na tela,
 * editáveis, e o total se refaz a cada tecla. Por isso o cálculo é síncrono e
 * client-side, sem rota de API nenhuma — não é economia de infraestrutura, é o
 * que permite o número acompanhar o campo enquanto a pessoa ainda está
 * decidindo se concorda com o fator.
 */

/** Média de semanas por mês (52 / 12). Fixa, e visível na fórmula da tela. */
const SEMANAS_POR_MES = 4.33;

/**
 * Valor-hora sugerido, conservador de propósito. O brief pede um padrão já
 * preenchido em vez de perguntar "quanto vale seu tempo" — pergunta que trava
 * quem nunca pensou nisso e deixa o campo vazio olhando para a pessoa.
 */
const VALOR_HORA_PADRAO = 30;

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

/**
 * Duas casas, não uma.
 *
 * Com uma casa, a conta aberta parava de fechar: 3 × 20 min dá 4,33 h/mês, a
 * tela mostrava "4,3", e quem multiplicasse o que estava vendo (4,3 × R$ 30 =
 * R$ 129) não chegava no total exibido (R$ 130). Numa peça cuja promessa é
 * "confira a conta", um real de diferença inexplicada custa mais do que a casa
 * decimal a mais polui.
 */
const horas = (n: number) =>
  n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/** "4,33" e não "4.33" — o número cru de JS entraria com ponto no meio de um texto em pt-BR. */
const SEMANAS_TEXTO = SEMANAS_POR_MES.toLocaleString("pt-BR");

/**
 * Campos guardados como string, não como number. Um <input type="number">
 * controlado por number não deixa apagar o conteúdo para digitar outro valor:
 * "" vira NaN, NaN volta como 0, e o campo repõe o zero embaixo do cursor. Com
 * string, o campo vazio continua vazio e a conta trata isso como 0 sem brigar
 * com quem está digitando.
 */
type Campos = {
  vezes: string;
  minutos: string;
  valorHora: string;
};

const INICIAL: Campos = {
  vezes: "3",
  minutos: "20",
  valorHora: String(VALOR_HORA_PADRAO),
};

function numero(valor: string): number {
  // Vírgula é o separador decimal que um teclado brasileiro produz primeiro.
  const n = Number.parseFloat(valor.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function Calculadora() {
  const [campos, setCampos] = useState<Campos>(INICIAL);
  const idVezes = useId();
  const idMinutos = useId();
  const idValor = useId();

  const vezes = numero(campos.vezes);
  const minutos = numero(campos.minutos);
  const valorHora = numero(campos.valorHora);

  const horasMes = (vezes * minutos * SEMANAS_POR_MES) / 60;
  const custoMes = horasMes * valorHora;
  const custoAno = custoMes * 12;

  const vazio = vezes === 0 || minutos === 0 || valorHora === 0;

  function set(campo: keyof Campos) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setCampos((c) => ({ ...c, [campo]: e.target.value }));
  }

  return (
    <div className="calc">
      <div className="calc-campos">
        <div className="calc-campo">
          <label htmlFor={idVezes}>Quantas vezes por semana</label>
          <input
            id={idVezes}
            type="number"
            inputMode="decimal"
            min="0"
            step="1"
            value={campos.vezes}
            onChange={set("vezes")}
          />
          <span className="campo-apoio">esse processo se repete</span>
        </div>

        <div className="calc-campo">
          <label htmlFor={idMinutos}>Quantos minutos cada vez</label>
          <input
            id={idMinutos}
            type="number"
            inputMode="decimal"
            min="0"
            step="5"
            value={campos.minutos}
            onChange={set("minutos")}
          />
          <span className="campo-apoio">do começo ao fim, contando a conferência</span>
        </div>

        <div className="calc-campo">
          <label htmlFor={idValor}>Valor da hora de quem faz</label>
          <input
            id={idValor}
            type="number"
            inputMode="decimal"
            min="0"
            step="5"
            value={campos.valorHora}
            onChange={set("valorHora")}
          />
          <span className="campo-apoio">
            sugestão conservadora — troque pelo número real da sua operação
          </span>
        </div>
      </div>

      {/*
        O resultado é aria-live="polite": quem usa leitor de tela ouve o total
        novo depois de parar de digitar, em vez de ter que sair do campo e
        procurar o número. "polite" e não "assertive" de propósito — o valor
        muda a cada tecla e interromper a cada dígito seria hostil.
      */}
      <div className="calc-saida" aria-live="polite">
        <p className="calc-rotulo">Esse processo custa, por mês</p>
        <p className="calc-total">{vazio ? "—" : brl.format(custoMes)}</p>
        <p className="calc-ano">
          {vazio
            ? "Preencha os três campos para ver a conta."
            : `${brl.format(custoAno)} por ano · ${horas(horasMes)} horas por mês`}
        </p>
      </div>

      {/*
        A conta por extenso, com os números que estão nos campos agora. É o
        miolo da peça: sem isto, o total é indistinguível de um chute com
        estilo.
      */}
      <div className="calc-formula">
        <p className="calc-formula-titulo">A conta, aberta</p>
        <p className="calc-formula-linha">
          <strong>{campos.vezes || "0"}</strong> vezes por semana ×{" "}
          <strong>{campos.minutos || "0"}</strong> min × <strong>{SEMANAS_TEXTO}</strong>{" "}
          semanas/mês ÷ <strong>60</strong> = <strong>{horas(horasMes)} h/mês</strong>
        </p>
        <p className="calc-formula-linha">
          <strong>{horas(horasMes)} h/mês</strong> × <strong>{brl.format(valorHora)}</strong>{" "}
          por hora = <strong>{vazio ? "—" : `≈ ${brl.format(custoMes)}`}</strong>
        </p>
        <p className="calc-formula-nota">
          {SEMANAS_TEXTO} é a média de semanas por mês (52 ÷ 12), e o total é arredondado para
          o real mais próximo — daí o ≈. Nenhum outro número entra na conta: não há
          multiplicador escondido, nem comparação com o que eu cobraria.
        </p>
      </div>

      <button type="button" className="calc-reset" onClick={() => setCampos(INICIAL)}>
        Voltar aos valores iniciais
      </button>

      {/*
        O gancho do brief-08 (/leitura) mora aqui, escondido pela regra do
        vazio enquanto aquela peça não existir. Quando existir, este bloco vira
        um link — não um formulário novo, porque a entrega é responsabilidade
        dela, não desta.
      */}
    </div>
  );
}
