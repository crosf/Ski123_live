@echo off
chcp 65001 >nul
echo Открытие порта 3000 в Брандмауэре Windows для доступа из сети...
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Запрос прав администратора...
    powershell -Command "Start-Process cmd -ArgumentList '/c netsh advfirewall firewall add rule name=\"Ski123 Live Timing\" dir=in action=allow protocol=TCP localport=3000' -Verb RunAs"
    echo Готово! Порт 3000 открыт.
    pause
    exit /b
)

netsh advfirewall firewall add rule name="Ski123 Live Timing" dir=in action=allow protocol=TCP localport=3000
echo Готово! Порт 3000 открыт для локальной сети.
pause
