@echo off
:: CBS 3D Sehir Modeli - Chrome ile Ac
:: Chrome'u --allow-file-access-from-files bayragi ile baslatir

:: Tum acik Chrome pencerelerini kapat (uyari: diger sekmeler de kapanir!)
:: Eger bu davranisi istemiyorsaniz asagidaki satiri silin:
taskkill /F /IM chrome.exe >nul 2>&1
timeout /t 1 /nobreak >nul

:: Chrome yolunu bul
set CHROME_PATH=
for %%p in (
    "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
    "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
    "%LocalAppData%\Google\Chrome\Application\chrome.exe"
) do (
    if exist %%p set CHROME_PATH=%%p
)

if "%CHROME_PATH%"=="" (
    echo Chrome bulunamadi! Lutfen Chrome'un yuklu oldugunden emin olun.
    pause
    exit /b 1
)

:: Proje dizinini bul (bu bat dosyasinin oldugu klasor)
set PROJECT_DIR=%~dp0

:: Chrome'u ozel bayrakla ac
start "" %CHROME_PATH% --allow-file-access-from-files --disable-web-security --user-data-dir="%TEMP%\chrome_cbs_dev" "file:///%PROJECT_DIR%app/index.html"

echo.
echo CBS 3D Sehir Modeli Chrome'da acildi!
echo.
