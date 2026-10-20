@echo off
call "%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=amd64 -host_arch=amd64
if errorlevel 1 exit /b %errorlevel%
set "PATH=%PATH%;%USERPROFILE%\.cargo\bin"
pnpm.cmd run tauri build
exit /b %errorlevel%
