@echo off
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
node node_modules/electron/cli.js .
