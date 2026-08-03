@echo off
REM Sobe o servidor de desenvolvimento e abre o navegador.
REM %~dp0 e a pasta deste arquivo — evita depender do caminho com acento.
cd /d "%~dp0"
echo Subindo o servidor em http://localhost:3000
echo Feche esta janela para parar.
echo.
call npm run dev
pause
