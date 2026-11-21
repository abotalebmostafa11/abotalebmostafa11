[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$Source,
    [ValidateSet('Build','Run')][string]$Action = 'Run',
    [string]$Output,
    [string]$Snapshot
)

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$appRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'CppStart'
$bin = Join-Path $appRoot 'toolchain\bin'
$compiler = Join-Path $bin 'clang++.exe'
$exitCode = 1
$scratch = $null
$temporaryExe = $null
$overlay = $null
$oldInputCp = 0
$oldOutputCp = 0
$language = [Globalization.CultureInfo]::CurrentUICulture.TwoLetterISOLanguageName
try {
    $savedLanguage = [IO.File]::ReadAllText((Join-Path $appRoot 'language.txt')).Trim()
    if ($savedLanguage -in @('ar','bn','en','ru')) { $language = $savedLanguage }
} catch { }
$messages = @{
    en = @('Save and select a C++ source file before running.', 'The compiler is missing. Run C++ Start Setup again.', 'Choose an .exe file as the build output.', 'Built')
    ar = @('احفظ ملف مصدر C++ وافتحه قبل التشغيل.', 'تعذّر العثور على المترجم. شغّل برنامج إعداد C++ Start مرة أخرى.', 'اختر ملفًا بامتداد .exe لحفظ ناتج الترجمة.', 'تم بناء الملف')
    bn = @('চালানোর আগে C++ সোর্স ফাইল সংরক্ষণ করে সেটি খুলুন।', 'কম্পাইলার পাওয়া যায়নি। C++ Start সেটআপ আবার চালান।', 'কম্পাইল করা ফাইলের জন্য .exe এক্সটেনশন ব্যবহার করুন।', 'তৈরি হয়েছে')
    ru = @('Перед запуском сохраните и откройте файл с исходным кодом C++.', 'Компилятор не найден. Повторите установку C++ Start.', 'Для результата сборки выберите файл с расширением .exe.', 'Файл собран')
}
if (-not $messages.ContainsKey($language)) { $language = 'en' }
$words = $messages[$language]

function Write-Utf8Line([string]$Text, [bool]$StandardError) {
    if ($StandardError) { $stream = [Console]::OpenStandardError() }
    else { $stream = [Console]::OpenStandardOutput() }
    $bytes = $utf8.GetBytes($Text + [Environment]::NewLine)
    $stream.Write($bytes,0,$bytes.Length)
    $stream.Flush()
}

function Invoke-Program([string]$File, [string[]]$ArgumentValues, [string]$Directory) {
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $File
    $info.WorkingDirectory = $Directory
    $info.UseShellExecute = $false
    # Arguments are fixed switches or validated full file names. No argument is a directory
    # ending in a backslash or contains a quote, which Windows excludes from file names.
    $info.Arguments = (@($ArgumentValues | ForEach-Object { '"' + $_ + '"' }) -join ' ')
    $info.EnvironmentVariables['PATH'] = $bin + [IO.Path]::PathSeparator + $env:PATH
    $capture = $Action -eq 'Build'
    if ($capture) {
        # The VS Code extension host has no attached console. Pass Clang's actual
        # diagnostic bytes to its two pipes and prevent a separate console window.
        $info.CreateNoWindow = $true
        $info.RedirectStandardOutput = $true
        $info.RedirectStandardError = $true
    }
    $process = [Diagnostics.Process]::Start($info)
    try {
        if ($capture) {
            $outTask = $process.StandardOutput.BaseStream.CopyToAsync([Console]::OpenStandardOutput())
            $errTask = $process.StandardError.BaseStream.CopyToAsync([Console]::OpenStandardError())
        }
        $process.WaitForExit()
        if ($capture) {
            [void]$outTask.GetAwaiter().GetResult()
            [void]$errTask.GetAwaiter().GetResult()
        }
        return $process.ExitCode
    } finally { $process.Dispose() }
}

try {
    if ([Environment]::OSVersion.Platform -eq 'Win32NT' -and
        (-not [Console]::IsOutputRedirected -or -not [Console]::IsInputRedirected)) {
        Add-Type -Namespace CppStart -Name ConsolePages -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("kernel32.dll")] public static extern uint GetConsoleCP();
[System.Runtime.InteropServices.DllImport("kernel32.dll")] public static extern uint GetConsoleOutputCP();
[System.Runtime.InteropServices.DllImport("kernel32.dll")] public static extern bool SetConsoleCP(uint page);
[System.Runtime.InteropServices.DllImport("kernel32.dll")] public static extern bool SetConsoleOutputCP(uint page);
'@
        $oldInputCp = [CppStart.ConsolePages]::GetConsoleCP()
        $oldOutputCp = [CppStart.ConsolePages]::GetConsoleOutputCP()
        if ($oldInputCp) { [void][CppStart.ConsolePages]::SetConsoleCP(65001) }
        if ($oldOutputCp) { [void][CppStart.ConsolePages]::SetConsoleOutputCP(65001) }
    }
    $sourcePath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Source)
    $extension = [IO.Path]::GetExtension($sourcePath)
    if (-not [IO.File]::Exists($sourcePath) -or
        ($extension -notin @('.cpp','.cc','.cxx','.c++','.cp','.cppm','.ixx') -and $extension -cne '.C')) { throw $words[0] }
    if (-not [IO.File]::Exists($compiler)) { throw $words[1] }
    $sourceDirectory = [IO.Path]::GetDirectoryName($sourcePath)

    if ($Output) {
        $destination = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Output)
        if ([IO.Path]::GetExtension($destination) -ne '.exe') { throw $words[2] }
    } elseif ($Action -eq 'Build') {
        $sha = [Security.Cryptography.SHA256]::Create()
        try { $digest = [BitConverter]::ToString($sha.ComputeHash($utf8.GetBytes($sourcePath.ToUpperInvariant()))).Replace('-','') }
        finally { $sha.Dispose() }
        $buildDirectory = Join-Path (Join-Path $appRoot 'builds') $digest.Substring(0,20)
        $destination = Join-Path $buildDirectory ([IO.Path]::GetFileNameWithoutExtension($sourcePath) + '.exe')
    } else {
        $scratch = Join-Path ([IO.Path]::GetTempPath()) ('CppStart-run-' + [Guid]::NewGuid().ToString('N'))
        $destination = Join-Path $scratch 'program.exe'
    }

    $directory = [IO.Path]::GetDirectoryName($destination)
    [void][IO.Directory]::CreateDirectory($directory)
    $temporaryExe = Join-Path $directory ('cppstart-' + [Guid]::NewGuid().ToString('N') + '.exe')
    $flags = @('-x','c++','-std=c++20','-g','-O0','-Wall','-Wextra','-finput-charset=UTF-8','-fexec-charset=UTF-8','-fdiagnostics-color=never')
    if ($Snapshot) {
        $snapshotPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Snapshot)
        if (-not [IO.File]::Exists($snapshotPath)) { throw "Missing editor snapshot: $snapshotPath" }
        $map = @{
            version = 0
            'use-external-names' = $false
            roots = @(@{type='file'; name=$sourcePath; 'external-contents'=$snapshotPath})
        }
        $overlay = Join-Path $directory ('cppstart-' + [Guid]::NewGuid().ToString('N') + '.json')
        [IO.File]::WriteAllText($overlay, ($map | ConvertTo-Json -Depth 4 -Compress), $utf8)
        $flags += @('-ivfsoverlay', $overlay)
    }
    $flags += $sourcePath
    if ([Environment]::OSVersion.Platform -eq 'Win32NT') {
        $manifest = Join-Path $PSScriptRoot 'program-utf8.res'
        $flags += @('-x', 'none', $manifest)
    }
    $flags += @('-o', $temporaryExe)
    $exitCode = Invoke-Program $compiler $flags $sourceDirectory
    if ($exitCode -eq 0) {
        if ([IO.File]::Exists($destination)) {
            # Use the File.Replace three-argument overload without creating a backup file.
            [IO.File]::Replace($temporaryExe,$destination,[System.Management.Automation.Language.NullString]::Value)
        } else {
            [IO.File]::Move($temporaryExe,$destination)
        }
        if ($Action -eq 'Run') { $exitCode = Invoke-Program $destination @() $sourceDirectory }
        elseif (-not $Output) { Write-Utf8Line ($words[3] + '  ' + $destination) $false }
    }
} catch {
    $exitCode = 1
    Write-Utf8Line $_.Exception.Message $true
} finally {
    if ($overlay) { try { [IO.File]::Delete($overlay) } catch { } }
    if ($temporaryExe) { try { [IO.File]::Delete($temporaryExe) } catch { } }
    if ($scratch -and [IO.Directory]::Exists($scratch)) { try { [IO.Directory]::Delete($scratch,$true) } catch { } }
    if ($oldInputCp) { [void][CppStart.ConsolePages]::SetConsoleCP($oldInputCp) }
    if ($oldOutputCp) { [void][CppStart.ConsolePages]::SetConsoleOutputCP($oldOutputCp) }
}
exit $exitCode
