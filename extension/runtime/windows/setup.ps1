[CmdletBinding()]
param([ValidateSet('en', 'ar', 'bn', 'ru')][string]$Language = 'en', [string]$CancelFile)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$release = '20261117'
$packages = @{
    x86 = @{ arch = 'i686'; size = 195782513; sha = 'c1806817728ff4bdf780e21365397fc9f427ade813ca097bda6ae7e4a9803cb4' }
    AMD64 = @{ arch = 'x86_64'; size = 191082415; sha = '4d002e330a0f703625aa5ccbc37e96f8f824413e163bfc7336774aabd2c3a412' }
    ARM64 = @{ arch = 'aarch64'; size = 186213427; sha = 'c7f56de1d7aca15196c19083a799205390397b8b87a825aec3485e1e4f3c2cdd' }
}
$stage = 'check'
$lock = $null
$logPath = $null
$exitCode = 1

function Test-Cancel {
    if ($CancelFile -and [IO.File]::Exists($CancelFile)) { throw [OperationCanceledException]::new('Setup was cancelled.') }
}

function Set-Stage([string]$Name) {
    Test-Cancel
    $script:stage = $Name
    [Console]::Out.WriteLine("STAGE $Name")
}

function Write-Detail([string]$Message) {
    if ($logPath) {
        try {
            [IO.File]::AppendAllText($logPath, ('{0:s}  {1}{2}' -f [DateTime]::Now, $Message, [Environment]::NewLine), $utf8)
        } catch { }
    }
}

function Remove-TemporaryDirectory([string]$Directory) {
    if ([IO.Directory]::Exists($Directory)) {
        [IO.Directory]::Delete($Directory, $true)
    }
}

function Receive-Archive([string]$Uri, [string]$Part, [long]$Size) {
    $offset = 0L
    if ([IO.File]::Exists($Part)) { $offset = ([IO.FileInfo]$Part).Length }
    if ($offset -eq $Size) { return }
    if ($offset -gt $Size) { [IO.File]::Delete($Part); $offset = 0L }

    $request = [Net.HttpWebRequest][Net.WebRequest]::Create($Uri)
    $request.UserAgent = 'CppStartVSCode/2.2'
    $request.Timeout = 45000
    $request.ReadWriteTimeout = 45000
    if ($request.Proxy) { $request.Proxy.Credentials = [Net.CredentialCache]::DefaultNetworkCredentials }
    if ($offset -gt 0) { $request.AddRange([long]$offset) }
    $response = $null
    $inputStream = $null
    $outputStream = $null
    try {
        $response = $request.GetResponse()
        if ([int]$response.StatusCode -eq 206) {
            $range = $response.Headers['Content-Range']
            if ($range -notmatch '^bytes (\d+)-(\d+)/(\d+)$' -or
                [long]$Matches[1] -ne $offset -or [long]$Matches[3] -ne $Size) {
                [IO.File]::Delete($Part)
                throw 'The server returned an inconsistent byte range.'
            }
            $mode = [IO.FileMode]::Append
        } elseif ([int]$response.StatusCode -eq 200) {
            $offset = 0L
            $mode = [IO.FileMode]::Create
        } else {
            throw "Unexpected HTTP status: $([int]$response.StatusCode)"
        }
        $outputStream = [IO.File]::Open($Part, $mode, [IO.FileAccess]::Write, [IO.FileShare]::None)
        $inputStream = $response.GetResponseStream()
        $buffer = New-Object byte[] 262144
        $lastPercent = -1
        while (($count = $inputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
            Test-Cancel
            $offset += $count
            if ($offset -gt $Size) { throw 'The download exceeded its expected size.' }
            $outputStream.Write($buffer, 0, $count)
            $percent = [int][Math]::Floor(100.0 * $offset / $Size)
            if ($percent -ne $lastPercent) {
                [Console]::Out.WriteLine("PROGRESS $percent")
                $lastPercent = $percent
            }
        }
        if ($offset -ne $Size) { throw "Incomplete download: $offset of $Size bytes." }
    } finally {
        if ($outputStream) { $outputStream.Dispose() }
        if ($inputStream) { $inputStream.Dispose() }
        if ($response) { $response.Dispose() }
        $request.Abort()
    }
}

function Get-Archive([hashtable]$Package, [string]$FileName, [string]$Cache) {
    $zip = Join-Path $Cache $FileName
    $part = "$zip.part"
    if ([IO.File]::Exists($zip)) {
        Set-Stage verify
        if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -eq $Package.sha) {
            Write-Detail 'Reusing the verified cached download.'
            return $zip
        }
        [IO.File]::Delete($zip)
    }
    $uri = "https://github.com/mstorsjo/llvm-mingw/releases/download/$release/$FileName"
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        try {
            Set-Stage download
            Write-Detail "Download attempt $attempt from $uri"
            Receive-Archive $uri $part $Package.size
            Set-Stage verify
            if ((Get-FileHash -LiteralPath $part -Algorithm SHA256).Hash -ne $Package.sha) {
                [IO.File]::Delete($part)
                throw 'The package failed its SHA-256 verification.'
            }
            [IO.File]::Move($part, $zip)
            Write-Detail "Verified SHA-256 $($Package.sha)"
            return $zip
        } catch {
            Test-Cancel
            Write-Detail $_.Exception.Message
            if ($attempt -eq 3) { throw }
            Start-Sleep -Seconds (2 * $attempt)
        }
    }
}

function Invoke-CheckedProgram([string]$Executable, [string]$Arguments, [string]$Directory, [string]$Bin, [int]$TimeoutMs) {
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $Executable
    $info.WorkingDirectory = $Directory
    $info.Arguments = $Arguments
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.StandardOutputEncoding = $utf8
    $info.StandardErrorEncoding = $utf8
    if ($Bin) { $info.EnvironmentVariables['PATH'] = "$Bin;$env:PATH" }
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $info
    try {
        [void]$process.Start()
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit($TimeoutMs)) {
            try { $process.Kill() } catch { }
            throw "Time limit exceeded for $Executable."
        }
        $out = $stdout.GetAwaiter().GetResult()
        $err = $stderr.GetAwaiter().GetResult()
        if ($process.ExitCode -ne 0) { throw "$Executable returned $($process.ExitCode). $err $out" }
        if ($err.Length) { Write-Detail $err }
        return $out
    } finally { $process.Dispose() }
}

function Test-Toolchain([string]$Toolchain, [string]$TestDirectory) {
    Set-Stage test
    [void][IO.Directory]::CreateDirectory($TestDirectory)
    $code = @'
#include <algorithm>
#include <iostream>
#include <string>
#include <vector>

int main() {
    std::vector<int> numbers{4, 1, 2};
    std::sort(numbers.begin(), numbers.end());
    if (numbers.front() != 1 || numbers.back() != 4) return 2;
    const std::string greeting = "Hello | مرحبًا | বাংলা | Привет";
    std::cout << greeting;
    return 0;
}
'@
    [IO.File]::WriteAllText((Join-Path $TestDirectory 'check.cpp'), $code, $utf8)
    $bin = Join-Path $Toolchain 'bin'
    $compiler = Join-Path $bin 'clang++.exe'
    [void](Invoke-CheckedProgram $compiler '-std=c++20 check.cpp -o check.exe' $TestDirectory $bin 120000)
    $text = Invoke-CheckedProgram (Join-Path $TestDirectory 'check.exe') '' $TestDirectory $bin 20000
    if ($text -cne 'Hello | مرحبًا | বাংলা | Привет') { throw 'The compiled program did not produce the expected English, Arabic, Bengali and Russian UTF-8 text.' }
    Write-Detail 'C++20 compilation, linking, execution and English/Arabic/Bengali/Russian UTF-8 output passed.'
}

function Test-EditorRun([string]$TestDirectory, [string]$CompilerBin) {
    # Test the same runner used by the VS Code button with a separate source
    # folder, an editor snapshot and a header beside the original source.
    $folder = Join-Path $TestDirectory 'বাংলা'
    [void][IO.Directory]::CreateDirectory($folder)
    $source = Join-Path $folder 'new.cpp'
    $snapshot = Join-Path $TestDirectory 'editor-buffer.cpp'
    $header = Join-Path $folder 'lesson.hpp'
    [IO.File]::WriteAllText($source, '#error This check requires the editor buffer', $utf8)
    [IO.File]::WriteAllText($header, '#define GREETING "Hello | مرحبا | শিক্ষার্থী | Привет"', $utf8)
    $program = @'
#include "lesson.hpp"
#include <iostream>
int main() { std::cout << GREETING; }
'@
    [IO.File]::WriteAllText($snapshot, $program, $utf8)
    $runner = Join-Path $PSScriptRoot 'vscode-run.ps1'
    $exe = Join-Path $TestDirectory 'new-program.exe'
    $shell = Join-Path $PSHOME 'powershell.exe'
    $arguments = '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File "' + $runner + '" -Source "' + $source + '" -Snapshot "' + $snapshot + '" -Action Build -Output "' + $exe + '"'
    [void](Invoke-CheckedProgram $shell $arguments $folder $CompilerBin 300000)
    $actual = Invoke-CheckedProgram $exe '' $folder $CompilerBin 20000
    if ($actual -cne 'Hello | مرحبا | শিক্ষার্থী | Привет') { throw 'The VS Code runner failed its four-language output check.' }
    Write-Detail 'A new C++ file passed the VS Code runner test in English, Arabic, Bengali and Russian.'
}


try {
    Set-Stage check
    $root = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'CppStart'
    [void][IO.Directory]::CreateDirectory($root)
    $logPath = Join-Path $root 'setup.log'
    $lockPath = Join-Path $root 'setup.lock'
    $waitClock = [Diagnostics.Stopwatch]::StartNew()
    while (!$lock) {
        Test-Cancel
        try { $lock = [IO.File]::Open($lockPath,'OpenOrCreate','ReadWrite','None') }
        catch [IO.IOException] {
            if (($_.Exception.GetBaseException().HResult -band 0xffff) -notin @(32,33)) { throw }
            if ($waitClock.Elapsed.TotalMinutes -ge 30) { throw 'Another setup is still running. Wait for that setup and try again.' }
            if ($stage -ne 'wait') { Set-Stage wait }
            Start-Sleep -Milliseconds 700
        }
    }
    Write-Detail "Starting compiler setup $release ($Language)."
    $build = [int](Get-ItemPropertyValue -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' -Name CurrentBuildNumber)
    $arch = [Environment]::GetEnvironmentVariable('PROCESSOR_ARCHITECTURE', 'Machine')
    if (-not $arch) { $arch = $env:PROCESSOR_ARCHITEW6432 }
    if (-not $arch) { $arch = $env:PROCESSOR_ARCHITECTURE }
    # The same Win32 installer runs on 32-bit, x64, and Arm PCs.
    # Choose the compiler for the native OS, including when a process is emulated.
    try {
        Add-Type -Namespace CppStart -Name MachineInfo -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("kernel32.dll", SetLastError = true)]
public static extern bool IsWow64Process2(System.IntPtr process, out ushort processMachine, out ushort nativeMachine);
'@
        [UInt16]$processMachine = 0
        [UInt16]$nativeMachine = 0
        if ([CppStart.MachineInfo]::IsWow64Process2([IntPtr](-1), [ref]$processMachine, [ref]$nativeMachine)) {
            if ($nativeMachine -eq 0xaa64) { $arch = 'ARM64' }
            elseif ($nativeMachine -eq 0x8664) { $arch = 'AMD64' }
            elseif ($nativeMachine -eq 0x014c) { $arch = 'x86' }
            else { $arch = "unsupported-$nativeMachine" }
        }
    } catch { Write-Detail "Using system environment for architecture detection: $($_.Exception.Message)" }
    if ($build -lt 17763 -or -not $packages.ContainsKey([string]$arch)) {
        $stage = 'unsupported'
        throw "Windows 10 version 1809 or newer on x86, x64 or ARM64 is required. Build $build, architecture $arch."
    }
    $package = $packages[$arch]
    $fileName = "llvm-mingw-$release-ucrt-$($package.arch).zip"
    Write-Detail "Windows build $build, architecture $arch, package $fileName."
    $binDir = Join-Path $root 'toolchain'
    $previous = Join-Path $root 'toolchain.previous'
    $staging = Join-Path $root 'staging'
    $testDir = Join-Path $root 'compiler-check'
    $cache = Join-Path $root 'cache'
    $stampName = 'cppstart-package.sha256'
    if (-not [IO.Directory]::Exists($binDir) -and [IO.Directory]::Exists($previous)) {
        [IO.Directory]::Move($previous, $binDir)
        Write-Detail 'Restored the previous installation after an interrupted switch.'
    }
    $ready = $false
    # Reuse any installed C++ Start toolchain that passes the actual C++20 test.
    # An older extension must not downgrade a newer working desktop installation.
    if ([IO.File]::Exists((Join-Path $binDir 'bin\clang++.exe'))) {
        try {
            Test-Toolchain $binDir $testDir
            $ready = $true
        } catch { Write-Detail "Installed compiler requires repair: $($_.Exception.Message)" }
    }
    if (-not $ready) {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        [void][IO.Directory]::CreateDirectory($cache)
        $zip = Get-Archive $package $fileName $cache
        Set-Stage extract
        Remove-TemporaryDirectory $staging
        [void][IO.Directory]::CreateDirectory($staging)
        $systemDir = Join-Path $env:WINDIR 'System32'
        if ([Environment]::Is64BitOperatingSystem -and -not [Environment]::Is64BitProcess) {
            $systemDir = Join-Path $env:WINDIR 'Sysnative'
        }
        $tar = Join-Path $systemDir 'tar.exe'
        $candidate = $staging
        try {
            [void](Invoke-CheckedProgram $tar ('-xf "' + $zip + '" --strip-components 1') $staging '' 900000)
        } catch {
            Write-Detail "Using the Windows .NET ZIP extractor: $($_.Exception.Message)"
            Remove-TemporaryDirectory $staging
            [void][IO.Directory]::CreateDirectory($staging)
            Add-Type -AssemblyName System.IO.Compression.FileSystem
            [IO.Compression.ZipFile]::ExtractToDirectory($zip, $staging)
            $candidate = Join-Path $staging ([IO.Path]::GetFileNameWithoutExtension($fileName))
        }
        Test-Toolchain $candidate $testDir
        [IO.File]::WriteAllText((Join-Path $candidate $stampName), $package.sha, $utf8)
        Set-Stage configure
        Remove-TemporaryDirectory $previous
        if ([IO.Directory]::Exists($binDir)) { [IO.Directory]::Move($binDir, $previous) }
        try {
            [IO.Directory]::Move($candidate, $binDir)
        } catch {
            if ([IO.Directory]::Exists($previous)) { [IO.Directory]::Move($previous, $binDir) }
            throw
        }
    }
    Set-Stage configure
    try { Test-EditorRun $testDir (Join-Path $binDir 'bin') }
    catch { $stage = 'test'; throw }
    try {
        Remove-TemporaryDirectory $previous
        Remove-TemporaryDirectory $staging
        Remove-TemporaryDirectory $testDir
    } catch { Write-Detail "Deferred cleanup: $($_.Exception.Message)" }
    Set-Stage done
    Write-Detail 'Setup completed.'
    $exitCode = 0
} catch {
    if ($CancelFile -and [IO.File]::Exists($CancelFile)) { $stage='cancelled'; $exitCode=2 }
    $message = $_.Exception.Message
    Write-Detail "Failure ($stage): $message"
    [Console]::Error.WriteLine($message)
    [Console]::Out.WriteLine("ERROR $stage")
} finally {
    if ($lock) { $lock.Dispose() }
}
exit $exitCode
