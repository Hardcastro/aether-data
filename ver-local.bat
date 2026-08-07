@echo off
REM Sobe o servidor de desenvolvimento e abre o navegador.
REM %~dp0 e a pasta deste arquivo — evita depender do caminho com acento.
cd /d "%~dp0"

REM ---------------------------------------------------------------------------
REM Memoria maior, e o motivo (07/08/2026):
REM
REM O Controle de Aplicativo do Windows bloqueia o compilador nativo do Next
REM (@next/swc-win32-x64-msvc, um .node sem assinatura aceita). O Next cai
REM sozinho no @next/swc-wasm-nodejs, que funciona mas roda dentro do heap do
REM V8 em vez de fora dele. Depois de algumas recompilacoes o processo estourou
REM com ERR_MEMORY_ALLOCATION_FAILED e o servidor morreu.
REM
REM 4 GB seguram o dev server. A correcao de verdade e liberar o binario nativo
REM na Seguranca do Windows, ou tirar o projeto de dentro do OneDrive — as duas
REM devolvem o compilador rapido e essa linha deixa de ser necessaria.
REM ---------------------------------------------------------------------------
set NODE_OPTIONS=--max-old-space-size=4096

echo Subindo o servidor em http://localhost:3000
echo A primeira compilacao demora (SWC em WebAssembly). Feche esta janela para parar.
echo.
call npm run dev
pause
