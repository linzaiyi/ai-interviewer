# ============================================
# AI 智能面试官 - 一键启动脚本
# 双击此文件或右键"使用 PowerShell 运行"
# ============================================

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  AI 智能面试官 - 正在启动..." -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# 1. 确保 Docker 容器在运行
Write-Host "`n[1/2] 检查数据库..." -ForegroundColor Yellow
$dockerRunning = docker ps --format "{{.Names}}" 2>$null | Select-String "ai-interviewer"
if (-not $dockerRunning) {
    Write-Host "  启动 PostgreSQL + Redis..." -ForegroundColor Gray
    docker compose -f "$projectRoot\docker-compose.yml" up -d
    Write-Host "  数据库已启动!" -ForegroundColor Green
} else {
    Write-Host "  数据库已在运行中!" -ForegroundColor Green
}

# 2. 启动后端（新窗口）
Write-Host "`n[2/2] 启动后端服务..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList @"
-NoExit -Command cd '$projectRoot\backend'; Write-Host '后端服务启动中...' -ForegroundColor Cyan; python -m uvicorn app.main:app --reload --port 8000
"@
Write-Host "  后端将在新窗口启动 (端口 8000)" -ForegroundColor Green

# 3. 启动前端（新窗口）
Write-Host "  启动前端服务..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList @"
-NoExit -Command cd '$projectRoot\frontend'; Write-Host '前端服务启动中...' -ForegroundColor Cyan; npm run dev
"@
Write-Host "  前端将在新窗口启动 (端口 3000)" -ForegroundColor Green

# 4. 等待前端就绪后打开浏览器
Write-Host "`n等待前端启动..." -ForegroundColor Yellow
Start-Sleep -Seconds 8
Start-Process "http://localhost:3000"

Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host "  全部启动! 浏览器已打开 http://localhost:3000" -ForegroundColor Green
Write-Host "  关闭终端窗口即可停止所有服务" -ForegroundColor Gray
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Read-Host "按 Enter 退出"