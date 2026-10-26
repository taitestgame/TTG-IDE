$proc = Start-Process -FilePath 'C:\code\python\Anchuyennganh\ttgide.exe' -PassThru -NoNewWindow -RedirectStandardOutput 'C:\code\python\Anchuyennganh\debug_out.log' -RedirectStandardError 'C:\code\python\Anchuyennganh\debug_err.log'

$proc.WaitForExit(6000)

Write-Output "HasExited: $($proc.HasExited)"
Write-Output "ExitCode: $($proc.ExitCode)"

Get-Content 'C:\code\python\Anchuyennganh\debug_out.log'
Get-Content 'C:\code\python\Anchuyennganh\debug_err.log'
