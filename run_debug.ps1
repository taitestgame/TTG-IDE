 = Start-Process -FilePath 'C:\code\python\Anchuyennganh\ttgide.exe' -PassThru -NoNewWindow -RedirectStandardOutput 'C:\code\python\Anchuyennganh\debug_out.log' -RedirectStandardError 'C:\code\python\Anchuyennganh\debug_err.log'
.WaitForExit(6000)
Write-Output  HasExited: 
Write-Output  ExitCode: 
Get-Content 'C:\code\python\Anchuyennganh\debug_out.log' -ErrorAction SilentlyContinue
Get-Content 'C:\code\python\Anchuyennganh\debug_err.log' -ErrorAction SilentlyContinue
