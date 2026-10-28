@echo off
chcp 65001 >nul
title Sayacla - iOS derleme ve TestFlight
set ROOT=%USERPROFILE%\Desktop\Tever Technology
if not exist "%ROOT%" mkdir "%ROOT%"
cd /d "%ROOT%"
if exist "Sayacla\.git" goto pull
echo [1/3] Proje indiriliyor...
git clone https://github.com/eymentever/sayacla.git Sayacla
if errorlevel 1 goto fail
:pull
cd /d "%ROOT%\Sayacla"
echo [1/3] Son kod aliniyor...
git checkout -- . 2>nul
git pull --ff-only
if errorlevel 1 goto fail
echo [2/3] Bagimliliklar...
call npm ci --no-audit --no-fund
if errorlevel 1 goto fail
rem Apple ID ve takim kimligini bu iki satira yazarak sorulari atlayabilirsin:
rem set EXPO_APPLE_ID=
rem set EXPO_APPLE_TEAM_ID=
echo [3/3] Derleme basliyor; bitince TestFlighta otomatik gider. Soru gelirse Y de.
call eas build -p ios --profile production --auto-submit
if errorlevel 1 goto fail
echo.
echo Tamam. TestFlight 30-40 dakika icinde hazir olur.
pause
exit /b 0
:fail
echo.
echo [HATA] Ekran goruntusunu Claudea gonder.
pause
exit /b 1
