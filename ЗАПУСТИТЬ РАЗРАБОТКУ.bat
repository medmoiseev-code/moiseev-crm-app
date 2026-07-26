@echo off
chcp 65001 >nul
cd /d "%~dp0"
where npm >nul 2>nul
if errorlevel 1 (
  echo Для режима живой разработки нужен Node.js.
  echo Пока используйте файл "ОТКРЫТЬ CRM.html".
  pause
  exit /b 1
)
if not exist node_modules (
  echo Первый запуск: устанавливаю компоненты...
  call npm install
)
start "" http://localhost:5173
call npm run dev
pause
