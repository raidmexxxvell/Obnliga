#!/usr/bin/env pwsh

# Универсальный скрипт проверки необходимых условий (PowerShell)
#
# Этот скрипт предоставляет объединенную проверку необходимых условий для рабочего процесса разработки на основе спецификаций.
# Он заменяет функциональность, ранее распространенную по нескольким скриптам.
#
# Использование: ./check-prerequisites.ps1 [ОПЦИИ]
#
# ОПЦИИ:
#   -Json               Вывод в формате JSON
#   -RequireTasks       Требовать наличие tasks.md (для этапа реализации)
#   -IncludeTasks       Включить tasks.md в список AVAILABLE_DOCS
#   -PathsOnly          Вывести только переменные путей (без проверки)
#   -Help, -h           Показать справочное сообщение

[CmdletBinding()]
param(
    [switch]$Json,
    [switch]$RequireTasks,
    [switch]$IncludeTasks,
    [switch]$PathsOnly,
    [switch]$Help
)

$ErrorActionPreference = 'Stop'

# Показать справку, если запрошено
if ($Help) {
    Write-Output @"
Использование: check-prerequisites.ps1 [ОПЦИИ]

Универсальная проверка необходимых условий для рабочего процесса разработки на основе спецификаций.

ОПЦИИ:
  -Json               Вывод в формате JSON
  -RequireTasks       Требовать наличие tasks.md (для этапа реализации)
  -IncludeTasks       Включить tasks.md в список AVAILABLE_DOCS
  -PathsOnly          Вывести только переменные путей (без проверки)
  -Help, -h           Показать это справочное сообщение

ПРИМЕРЫ:
  # Проверить условия для планирования (plan.md требуется)
  .\check-prerequisites.ps1 -Json
  
  # Проверить условия для реализации (plan.md + tasks.md требуется)
  .\check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks
  
  # Получить пути к функции (без проверки)
  .\check-prerequisites.ps1 -PathsOnly

"@
    exit 0
}

# Подключить общие функции
. "$PSScriptRoot/common.ps1"

# Получить пути к функции и проверить ветку
$paths = Get-FeaturePathsEnv

if (-not (Test-FeatureBranch -Branch $paths.CURRENT_BRANCH -HasGit:$paths.HAS_GIT)) { 
    exit 1 
}

# Если режим только путей, вывести пути и завершить (поддержка комбинации -Json -PathsOnly)
if ($PathsOnly) {
    if ($Json) {
        [PSCustomObject]@{
            REPO_ROOT    = $paths.REPO_ROOT
            BRANCH       = $paths.CURRENT_BRANCH
            FEATURE_DIR  = $paths.FEATURE_DIR
            FEATURE_SPEC = $paths.FEATURE_SPEC
            IMPL_PLAN    = $paths.IMPL_PLAN
            TASKS        = $paths.TASKS
        } | ConvertTo-Json -Compress
    } else {
        Write-Output "REPO_ROOT: $($paths.REPO_ROOT)"
        Write-Output "BRANCH: $($paths.CURRENT_BRANCH)"
        Write-Output "FEATURE_DIR: $($paths.FEATURE_DIR)"
        Write-Output "FEATURE_SPEC: $($paths.FEATURE_SPEC)"
        Write-Output "IMPL_PLAN: $($paths.IMPL_PLAN)"
        Write-Output "TASKS: $($paths.TASKS)"
    }
    exit 0
}

# Проверить необходимые директории и файлы
if (-not (Test-Path $paths.FEATURE_DIR -PathType Container)) {
    Write-Output "ОШИБКА: Директория функции не найдена: $($paths.FEATURE_DIR)"
    Write-Output "Сначала запустите /specify для создания структуры функции."
    exit 1
}

if (-not (Test-Path $paths.IMPL_PLAN -PathType Leaf)) {
    Write-Output "ОШИБКА: plan.md не найден в $($paths.FEATURE_DIR)"
    Write-Output "Сначала запустите /plan для создания плана реализации."
    exit 1
}

# Проверить tasks.md, если требуется
if ($RequireTasks -and -not (Test-Path $paths.TASKS -PathType Leaf)) {
    Write-Output "ОШИБКА: tasks.md не найден в $($paths.FEATURE_DIR)"
    Write-Output "Сначала запустите /tasks для создания списка задач."
    exit 1
}

# Сформировать список доступных документов
$docs = @()

# Всегда проверять эти необязательные документы
if (Test-Path $paths.RESEARCH) { $docs += 'research.md' }
if (Test-Path $paths.DATA_MODEL) { $docs += 'data-model.md' }

# Проверить директорию контрактов (только если она существует и содержит файлы)
if ((Test-Path $paths.CONTRACTS_DIR) -and (Get-ChildItem -Path $paths.CONTRACTS_DIR -ErrorAction SilentlyContinue | Select-Object -First 1)) { 
    $docs += 'contracts/' 
}

if (Test-Path $paths.QUICKSTART) { $docs += 'quickstart.md' }

# Включить tasks.md, если запрошено и он существует
if ($IncludeTasks -and (Test-Path $paths.TASKS)) { 
    $docs += 'tasks.md' 
}

# Вывести результаты
if ($Json) {
    # JSON вывод
    [PSCustomObject]@{ 
        FEATURE_DIR = $paths.FEATURE_DIR
        AVAILABLE_DOCS = $docs 
    } | ConvertTo-Json -Compress
} else {
    # Текстовый вывод
    Write-Output "FEATURE_DIR:$($paths.FEATURE_DIR)"
    Write-Output "AVAILABLE_DOCS:"
    
    # Показать статус каждого потенциального документа
    Test-FileExists -Path $paths.RESEARCH -Description 'research.md' | Out-Null
    Test-FileExists -Path $paths.DATA_MODEL -Description 'data-model.md' | Out-Null
    Test-DirHasFiles -Path $paths.CONTRACTS_DIR -Description 'contracts/' | Out-Null
    Test-FileExists -Path $paths.QUICKSTART -Description 'quickstart.md' | Out-Null
    
    if ($IncludeTasks) {
        Test-FileExists -Path $paths.TASKS -Description 'tasks.md' | Out-Null
    }
}