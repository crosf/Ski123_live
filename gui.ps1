Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
if (!$scriptDir) { $scriptDir = "c:\Users\user\Documents\Antigraviti\Ski123" }
Set-Location $scriptDir

$configPath = Join-Path $scriptDir "config.json"

function Get-CurrentConfig {
    if (Test-Path $configPath) {
        try {
            return Get-Content $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
        } catch {}
    }
    return [PSCustomObject]@{ targetUrl = "http://10.3.226.131/Info"; port = 3000 }
}

function Save-Ip([string]$newIp) {
    $cfg = Get-CurrentConfig
    $cleanIp = $newIp.Trim() -replace '^https?://', '' -replace '/Info.*$', '' -replace '/$', ''
    $cfg.targetUrl = "http://$cleanIp/Info"
    $json = $cfg | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText($configPath, $json, [System.Text.Encoding]::UTF8)
    return $cleanIp
}

function Get-NodeExe {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    if (Test-Path "C:\Program Files\nodejs\node.exe") { return "C:\Program Files\nodejs\node.exe" }
    return "node"
}

function Is-ServerRunning {
    try {
        # Работает одинаково надежно на Windows 7, 8, 10, 11
        $listeners = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
        foreach ($l in $listeners) {
            if ($l.Port -eq 3000) { return $true }
        }
    } catch {}
    return $false
}

function Start-ServerProcess {
    if (!(Is-ServerRunning)) {
        $node = Get-NodeExe
        $logOut = Join-Path $scriptDir "server_out.log"
        $logErr = Join-Path $scriptDir "server_err.log"
        Start-Process -FilePath $node -ArgumentList "server.js" -WorkingDirectory $scriptDir `
                      -RedirectStandardOutput $logOut -RedirectStandardError $logErr `
                      -WindowStyle Hidden
    }
}

function Stop-ServerProcess {
    try {
        # Надежное завершение процесса node server.js для Win 7 / 8 / 10 / 11
        Get-WmiObject Win32_Process -Filter "Name = 'node.exe' AND CommandLine LIKE '%server.js%'" -ErrorAction SilentlyContinue | ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
    } catch {}
}

[xml]$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Ski123 Live Timing - Управление" Height="445" Width="480"
        WindowStartupLocation="CenterScreen" ResizeMode="NoResize"
        Background="#0f172a" FontFamily="Segoe UI">
    <Window.Resources>
        <Style TargetType="Button">
            <Setter Property="FontSize" Value="13"/>
            <Setter Property="FontWeight" Value="SemiBold"/>
            <Setter Property="Foreground" Value="White"/>
            <Setter Property="Cursor" Value="Hand"/>
            <Setter Property="Padding" Value="10,8"/>
            <Setter Property="BorderThickness" Value="1"/>
            <Setter Property="Template">
                <Setter.Value>
                    <ControlTemplate TargetType="Button">
                        <Border x:Name="border" CornerRadius="8" Background="{TemplateBinding Background}" BorderBrush="{TemplateBinding BorderBrush}" Padding="{TemplateBinding Padding}">
                            <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
                        </Border>
                    </ControlTemplate>
                </Setter.Value>
            </Setter>
        </Style>
    </Window.Resources>

    <Grid Margin="24">
        <Grid.RowDefinitions>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="*"/>
        </Grid.RowDefinitions>

        <!-- Шапка -->
        <StackPanel Grid.Row="0" Margin="0,0,0,16">
            <TextBlock Text="🎿 Ski123 Live Timing" FontSize="20" FontWeight="Bold" Foreground="#38bdf8"/>
            <TextBlock Text="Панель управления трансляцией" FontSize="12" Foreground="#94a3b8" Margin="0,2,0,0"/>
        </StackPanel>

        <!-- Статус сервера -->
        <Border Grid.Row="1" Background="#1e293b" CornerRadius="10" Padding="14" Margin="0,0,0,16" BorderBrush="#334155" BorderThickness="1">
            <StackPanel>
                <DockPanel LastChildFill="True">
                    <TextBlock Text="Статус сервера:" FontSize="13" Foreground="#94a3b8" VerticalAlignment="Center"/>
                    <StackPanel Orientation="Horizontal" HorizontalAlignment="Right" VerticalAlignment="Center">
                        <Ellipse x:Name="StatusDot" Width="10" Height="10" Fill="#ef4444" Margin="0,0,8,0"/>
                        <TextBlock x:Name="StatusText" Text="ОСТАНОВЛЕН" FontSize="13" FontWeight="Bold" Foreground="#ef4444"/>
                    </StackPanel>
                </DockPanel>
                <DockPanel LastChildFill="True" Margin="0,8,0,0" x:Name="LanPanel">
                    <TextBlock Text="Адрес для зрителей в сети:" FontSize="12" Foreground="#64748b" VerticalAlignment="Center"/>
                    <TextBlock x:Name="TxtLanUrl" Text="http://10.3.226.131:3000" FontSize="12" FontWeight="Bold" Foreground="#38bdf8" HorizontalAlignment="Right" VerticalAlignment="Center"/>
                </DockPanel>
            </StackPanel>
        </Border>

        <!-- Блок IP -->
        <Border Grid.Row="2" Background="#1e293b" CornerRadius="10" Padding="14" Margin="0,0,0,16" BorderBrush="#334155" BorderThickness="1">
            <StackPanel>
                <TextBlock Text="IP-адрес хронометража (Ski123):" FontSize="12" FontWeight="SemiBold" Foreground="#94a3b8" Margin="0,0,0,8"/>
                <Grid>
                    <Grid.ColumnDefinitions>
                        <ColumnDefinition Width="*"/>
                        <ColumnDefinition Width="Auto"/>
                    </Grid.ColumnDefinitions>
                    <TextBox x:Name="TxtIp" Grid.Column="0" Height="36" Background="#0b1120" Foreground="#f8fafc" 
                             BorderBrush="#475569" BorderThickness="1" Padding="10,7" FontSize="13" FontWeight="Bold"/>
                    <Button x:Name="BtnSaveIp" Grid.Column="1" Content="Сохранить" Margin="8,0,0,0" Height="36"
                            Background="#3b82f6" BorderBrush="#2563eb" Width="100"/>
                </Grid>
                <TextBlock x:Name="LblSaveMsg" Text="" FontSize="11" Foreground="#10b981" Margin="0,6,0,0"/>
            </StackPanel>
        </Border>

        <!-- Кнопки управления -->
        <StackPanel Grid.Row="3" VerticalAlignment="Bottom">
            <Grid Margin="0,0,0,10">
                <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="*"/>
                    <ColumnDefinition Width="*"/>
                </Grid.ColumnDefinitions>
                <Button x:Name="BtnStart" Grid.Column="0" Content="▶ Запустить сервер" Background="#059669" BorderBrush="#10b981" Margin="0,0,6,0" Height="42"/>
                <Button x:Name="BtnStop" Grid.Column="1" Content="⏹ Остановить" Background="#dc2626" BorderBrush="#ef4444" Margin="6,0,0,0" Height="42"/>
            </Grid>
            <Button x:Name="BtnBrowser" Content="🌐 Открыть в браузере (http://localhost:3000)" Background="#1e293b" BorderBrush="#475569" Height="38"/>
        </StackPanel>
    </Grid>
</Window>
"@

$reader = (New-Object System.Xml.XmlNodeReader $xaml)
$window = [System.Windows.Markup.XamlReader]::Load($reader)

# Находим элементы
$statusDot = $window.FindName("StatusDot")
$statusText = $window.FindName("StatusText")
$txtLanUrl = $window.FindName("TxtLanUrl")
$txtIp = $window.FindName("TxtIp")
$btnSaveIp = $window.FindName("BtnSaveIp")
$lblSaveMsg = $window.FindName("LblSaveMsg")
$btnStart = $window.FindName("BtnStart")
$btnStop = $window.FindName("BtnStop")
$btnBrowser = $window.FindName("BtnBrowser")

# Определение локального IP для зрителей
try {
    $lanIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { 
        $_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -notlike "169.254*" 
    } | Select-Object -First 1).IPAddress
    if ($lanIp) {
        $txtLanUrl.Text = "http://${lanIp}:3000"
    }
} catch {}

# Инициализация значений
$cfg = Get-CurrentConfig
if ($cfg.targetUrl -match 'http://([^:/]+)') {
    $txtIp.Text = $matches[1]
} else {
    $txtIp.Text = "10.3.226.131"
}

function Update-UiStatus {
    if (Is-ServerRunning) {
        $statusDot.Fill = [System.Windows.Media.Brushes]::LimeGreen
        $statusText.Text = "РАБОТАЕТ (порт 3000)"
        $statusText.Foreground = [System.Windows.Media.Brushes]::LimeGreen
    } else {
        $statusDot.Fill = [System.Windows.Media.Brushes]::Crimson
        $statusText.Text = "ОСТАНОВЛЕН"
        $statusText.Foreground = [System.Windows.Media.Brushes]::Crimson
    }
}

Update-UiStatus

# Таймер автообновления статуса каждые 2 секунды
$timer = New-Object System.Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromSeconds(2)
$timer.Add_Tick({ Update-UiStatus })
$timer.Start()

# Обработчики
$btnSaveIp.Add_Click({
    $clean = Save-Ip $txtIp.Text
    $lblSaveMsg.Text = "✓ IP сохранен: $clean (если сервер запущен, перезапустите его)"
    if (Is-ServerRunning) {
        Stop-ServerProcess
        Start-Sleep -Milliseconds 600
        Start-ServerProcess
        $lblSaveMsg.Text = "✓ IP сохранен и сервер автоматически перезапущен!"
        Update-UiStatus
    }
})

$btnStart.Add_Click({
    $lblSaveMsg.Text = "Запуск сервера..."
    Start-ServerProcess
    for ($i = 0; $i -lt 15; $i++) {
        Start-Sleep -Milliseconds 200
        if (Is-ServerRunning) { break }
    }
    Update-UiStatus
    if (Is-ServerRunning) {
        $lblSaveMsg.Text = "✓ Сервер успешно запущен!"
        Start-Process "http://localhost:3000"
    } else {
        $errFile = Join-Path $scriptDir "server_err.log"
        $err = ""
        if (Test-Path $errFile) { $err = Get-Content $errFile -Raw }
        $lblSaveMsg.Text = "Не удалось запустить: $err"
    }
})

$btnStop.Add_Click({
    Stop-ServerProcess
    Start-Sleep -Milliseconds 500
    Update-UiStatus
    $lblSaveMsg.Text = "Сервер остановлен."
})

$btnBrowser.Add_Click({
    if (!(Is-ServerRunning)) {
        Start-ServerProcess
        for ($i = 0; $i -lt 15; $i++) {
            Start-Sleep -Milliseconds 200
            if (Is-ServerRunning) { break }
        }
        Update-UiStatus
    }
    Start-Process "http://localhost:3000"
})

# Автоматическое выключение сервера при закрытии окна
$window.Add_Closing({
    Stop-ServerProcess
})

$window.ShowDialog() | Out-Null
