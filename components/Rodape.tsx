import Link from "next/link";
import { PECAS } from "@/lib/manifesto";

type Props = {
  nome: string;
  perfis: { rotulo: string; href: string }[];
};

/**
 * Rodapé das páginas de prosa e de ferramenta — /sobre, /contato e as quatro
 * rotas que rodam aqui dentro.
 *
 * **Não aparece nas quatro telas de vitrine, e isso é do CSS, não de um `if`
 * aqui.** `body` é `overflow: hidden` com `height: 100vh`; só
 * `body:has(.ferramenta)` passa a rolar. Um rodapé em fluxo na home ficaria
 * recortado fora da janela — invisível e inalcançável pelo teclado. A regra
 * mora em `.rodape` no globals.css, junto da regra que faz o body rolar, que é
 * onde alguém vai procurar quando quiser mudar isso.
 *
 * A saída da vitrine é o canto direito do cabeçalho, que é fixo e existe nas
 * dez rotas. Este rodapé é o mesmo destino com espaço para respirar.
 */
export function Rodape({ nome, perfis }: Props) {
  const abertas = PECAS.filter((p) => p.repo).length;

  return (
    <footer className="rodape">
      {/*
        A caixa interna existe por alinhamento: o traço do rodapé precisa
        começar e terminar onde começa e termina o texto, igual ao traço do
        `.ferramenta-pe` logo acima. Com a borda na `<footer>`, ela nascia na
        borda da coluna de 46rem e o texto nascia 6% adentro — dois traços
        horizontais na mesma tela, desalinhados por ~88px.
      */}
      <div className="rodape-caixa">
      <div className="rodape-linha">
        <span className="rodape-marca">{nome}</span>
        {/*
          Uma expressão só, e não texto solto seguido de expressão: a quebra de
          linha do JSX entre os dois vira espaço, e a linha saía com "no ar ,
          todas" — o mesmo espaço antes da vírgula que já tinha aparecido no
          /sobre.
        */}
        <span className="rodape-nota">
          {`${PECAS.length} peças no ar, ${
            abertas === PECAS.length ? "todas" : abertas
          } com o código aberto`}
        </span>
      </div>
      <nav className="rodape-links" aria-label="Links de saída">
        <Link href="/sobre">Sobre mim</Link>
        <Link href="/contato">Contatos</Link>
        {perfis.map((p) => (
          <a key={p.href} href={p.href} target="_blank" rel="noreferrer">
            {p.rotulo} ↗
          </a>
        ))}
      </nav>
      </div>
    </footer>
  );
}
