"use client";

import type { GrupoInfo, Peca } from "@/lib/manifesto";
import { pecasPorGrupo } from "@/lib/manifesto";
import { Cartao } from "@/components/Cartao";
import { PainelPeca } from "@/components/PainelPeca";

type Props = {
  pecas: Peca[];
  grupos: GrupoInfo[];
  pecaAberta: Peca | null;
  contato: { email: string | null; whatsapp: string | null };
};

/**
 * Primeiro degrau: a lista agrupada, semântica, em ordem de leitura.
 * Nenhuma peça é desenhada em pixel, nenhum grupo vazio é renderizado.
 * O plano espacial (pan/zoom) e o movimento por cima entram nos próximos
 * dois commits — ver seção 13 do prompt-claude-code-04.
 */
export function Plano({ grupos, pecaAberta, contato }: Props) {
  return (
    <section className="relative w-full">
      <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 pb-24 pt-28 sm:px-6">
        {grupos.map((g) => (
          <div key={g.chave}>
            <h2 className="grupo-titulo text-h3 font-medium">{g.titulo}</h2>
            <p className="grupo-apoio mt-1 text-body-sm">{g.apoio}</p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {pecasPorGrupo(g.chave).map((p) => (
                <Cartao
                  key={p.slug}
                  peca={p}
                  registrarEl={() => {}}
                  onSuprimir={() => {}}
                  onFocoCamera={() => {}}
                  onAbrir={() => {}}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {pecaAberta && <PainelPeca peca={pecaAberta} contato={contato} />}
    </section>
  );
}
