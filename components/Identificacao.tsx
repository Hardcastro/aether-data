import { MARCA } from "@/site.config";

/**
 * Server component — MARCA nunca pode vazar para dentro do client component
 * do plano (ver seção 5 e 10 do prompt-claude-code-04). Por isso esta linha
 * de identificação é uma peça separada, renderizada antes do <Plano>.
 */
export function Identificacao() {
  return (
    <div className="identificacao pointer-events-none relative z-10 px-4 pb-2 pt-6 sm:px-6 md:absolute md:inset-x-0 md:top-0 md:px-8 md:py-6">
      <p className="text-body font-medium text-text-primary">{MARCA.nome}</p>
      <p className="mt-0.5 max-w-xs text-body-sm text-text-muted">{MARCA.promessa}</p>
    </div>
  );
}
