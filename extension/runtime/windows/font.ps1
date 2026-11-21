# Register the packaged Bengali face for this Windows user and interactive session.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$family = 'Noto Sans Bengali'
$fontHash = '2edcfabf11244dedadc61f183678328bfacf34185b3049acc27535909c81e534'
$registryPath = 'Software\Microsoft\Windows NT\CurrentVersion\Fonts'
$displayName = 'Noto Sans Bengali Regular (TrueType)'
$source = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\fonts\Bengali-Regular.ttf'))
$fontDir = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Microsoft\Windows\Fonts'
$file = Join-Path $fontDir ('CppStart-Bengali-' + $fontHash.Substring(0,12) + '.ttf')

function Result([bool]$ready, [bool]$changed, [bool]$reload) {
    [ordered]@{available=$ready; changed=$changed; mayNeedReload=$reload; family=$family} | ConvertTo-Json -Compress
}
function HasFamily {
    $fonts = [Drawing.Text.InstalledFontCollection]::new()
    try {
        foreach ($face in $fonts.Families) {
            if ([string]::Equals($face.Name,$family,[StringComparison]::OrdinalIgnoreCase)) { return $true }
        }
        return $false
    } finally { $fonts.Dispose() }
}

$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$mutex = [Threading.Mutex]::new($false,('Local\CppStartUserFont-' + $sid))
$locked=$false; $key=$null; $temp=$null
try {
    try { $locked=$mutex.WaitOne(15000) } catch [Threading.AbandonedMutexException] { $locked=$true }
    if (!$locked) { throw 'Another font registration is still running.' }
    Add-Type -AssemblyName System.Drawing
    if (HasFamily) { Result $true $false $false; return }
    if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $fontHash) { throw 'The bundled Bengali font failed its integrity check.' }
    $key=[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($registryPath)
    # Leave prior installations, including alternative Noto releases, untouched.
    foreach ($name in $key.GetValueNames()) {
        if ($name -match '^Noto Sans Bengali(?:\s|\(|$)') {
            $entry=[string]$key.GetValue($name)
            if ($name -eq $displayName -and [string]::Equals($entry,$file,[StringComparison]::OrdinalIgnoreCase)) { continue }
            # Desktop editions registered this exact font under another filename.
            # Reactivate their existing copy in this session without rewriting its registration.
            $legacy=Join-Path $fontDir 'CppStart-NotoSansBengali-Regular.ttf'
            if ($name -eq $displayName -and [string]::Equals($entry,$legacy,[StringComparison]::OrdinalIgnoreCase) -and
                [IO.File]::Exists($legacy) -and (Get-FileHash -LiteralPath $legacy -Algorithm SHA256).Hash -eq $fontHash) {
                $file=$legacy
                continue
            }
            Result $false $false $true; return
        }
    }
    [void][IO.Directory]::CreateDirectory($fontDir)
    $existed=[IO.File]::Exists($file)
    if (!$existed) {
        # Publish complete, verified bytes without replacing an existing file.
        $temp=Join-Path $fontDir ('CppStart-' + [Guid]::NewGuid().ToString('N') + '.tmp')
        [IO.File]::Copy($source,$temp,$false)
        if ((Get-FileHash -LiteralPath $temp -Algorithm SHA256).Hash -ne $fontHash) { throw 'The font copy failed its integrity check.' }
        try { [IO.File]::Move($temp,$file) } catch [IO.IOException] { if (![IO.File]::Exists($file)) {throw} }
    }
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $fontHash) { throw 'An existing user font with another version occupies the target path.' }
    Add-Type -Namespace CppStartFont -Name Native -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("gdi32.dll",CharSet=System.Runtime.InteropServices.CharSet.Unicode,ExactSpelling=true)]
public static extern int AddFontResourceExW(string file, uint flags, System.IntPtr reserved);
[System.Runtime.InteropServices.DllImport("user32.dll",CharSet=System.Runtime.InteropServices.CharSet.Unicode,ExactSpelling=true)]
public static extern System.IntPtr SendMessageTimeoutW(System.IntPtr window,uint message,System.UIntPtr wparam,System.IntPtr lparam,uint flags,uint timeout,out System.UIntPtr result);
'@
    if (![string]::Equals([string]$key.GetValue($displayName),$file,[StringComparison]::OrdinalIgnoreCase)) {
        $key.SetValue($displayName,$file,[Microsoft.Win32.RegistryValueKind]::String)
    }
    $count=[CppStartFont.Native]::AddFontResourceExW($file,0,[IntPtr]::Zero)
    if ($count -le 0) { throw 'Windows could not activate the Bengali font in this session.' }
    $reply=[UIntPtr]::Zero
    [void][CppStartFont.Native]::SendMessageTimeoutW([IntPtr]0xffff,0x001d,[UIntPtr]::Zero,[IntPtr]::Zero,2,250,[ref]$reply)
    Result $true $true $true
} finally {
    if($temp -and [IO.File]::Exists($temp)){[IO.File]::Delete($temp)}
    if($key){$key.Dispose()}
    if($locked){$mutex.ReleaseMutex()}
    $mutex.Dispose()
}
