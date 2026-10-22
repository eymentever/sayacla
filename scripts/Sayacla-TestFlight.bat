@echo off
chcp 65001 >nul
title Sayacla - TestFlight derlemesi
echo.
echo ============================================================
echo   Sayacla - iOS derlemesi ve TestFlight yuklemesi
echo ============================================================
echo.

where git >nul 2>nul
if errorlevel 1 goto nogit
where node >nul 2>nul
if errorlevel 1 goto nonode

cd /d "%USERPROFILE%\Desktop"
if exist "sayacla\.git" goto update
echo [1/6] Proje indiriliyor...
git clone https://github.com/eymentever/verim.git sayacla
if errorlevel 1 goto fail
cd sayacla
goto deps

:update
echo [1/6] Proje guncelleniyor...
cd sayacla
git pull --ff-only
if errorlevel 1 goto fail

:deps
echo.
echo [2/6] Bagimliliklar kuruluyor, birkac dakika surebilir...
call npm ci --no-audit --no-fund
if errorlevel 1 goto fail

echo.
echo [3/6] Kod kontrol ediliyor...
call npx tsc --noEmit
if errorlevel 1 goto fail

echo.
echo [4/6] EAS CLI hazirlaniyor...
call npm i -g eas-cli --no-audit --no-fund
call eas whoami >nul 2>nul
if not errorlevel 1 goto init
echo.
echo  ==^> Expo hesabinla giris yap - Mentra'da kullandigin hesap
call eas login
if errorlevel 1 goto fail

:init
echo.
echo [5/6] Expo projesi baglaniyor...
findstr /c:"projectId" app.json >nul
if not errorlevel 1 goto build
echo  ==^> "Create a new project?" sorusuna Y yazip Enter'a bas
call eas init
if errorlevel 1 goto fail

:build
echo.
echo [6/6] iOS derlemesi basliyor, bitince TestFlight'a gonderilecek.
echo  ==^> Apple ID: eymentever@gmail.com - sifre ve iki adimli dogrulama istenecek
echo  ==^> Takim sorulursa: Mustafa Eymen Tever - XGBDMRT3Q9
echo  ==^> Sertifika, profil ve API anahtari sorularina Y de
echo.
call eas build -p ios --profile production --auto-submit
if errorlevel 1 goto fail

echo.
echo ============================================================
echo   Tamam. Derleme ve yukleme baslatildi; link yukarida.
echo   TestFlight'a dusmesi 15-30 dakika surer.
echo ============================================================
pause
exit /b 0

:nogit
echo [HATA] Git kurulu degil. https://git-scm.com/download/win adresinden kur.
pause
exit /b 1

:nonode
echo [HATA] Node.js kurulu degil. https://nodejs.org adresinden LTS surumunu kur.
pause
exit /b 1

:fail
echo.
echo [HATA] Bir adim basarisiz oldu. Bu pencerenin ekran goruntusunu Claude'a gonder.
pause
exit /b 1
