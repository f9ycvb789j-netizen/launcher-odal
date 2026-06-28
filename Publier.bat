@echo off
echo Envoi des modifications sur GitHub...
cd /d "%~dp0"
git add -A
git commit -m "Mise a jour launcher"
git push
echo.
echo Termine ! GitHub va recompiler le launcher dans quelques minutes.
echo Va sur : https://github.com/f9ycvb789j-netizen/launcher-odal/actions
pause
