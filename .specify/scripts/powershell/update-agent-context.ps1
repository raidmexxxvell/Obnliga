#!/usr/bin/env pwsh
<#!
.SYNOPSIS
Обновление файлов контекста агентов с информацией из plan.md (версия PowerShell)

.DESCRIPTION
Повторяет поведение скриптов bash/update-agent-context.sh:
 1. Проверка окружения
 2. Извлечение данных плана
 3. Управление файлами агентов (создание из шаблона или обновление существующих)
 4. Генерация контента (стек технологий, недавние изменения, временная метка)
 5. Поддержка нескольких агентов (claude, gemini, copilot, cursor, qwen, opencode, codex, windsurf, kilocode, auggie, roo, q)

.PARAMETER AgentType
Опциональный ключ агента для обновления одного агента. Если не указан, обновляет все существующие файлы агентов (создает файл Claude по умолчанию, если они отсутствуют).

.EXAMPLE
./update-agent-context.ps1 -AgentType claude

.EXAMPLE
./update-agent-context.ps1   # Обновляет все существующие файлы агентов

.NOTES
Зависит от общих вспомогательных функций в common.ps1
#>
param(
    [Parameter(Position=0)]
    [ValidateSet('claude','gemini','copilot','cursor','qwen','opencode','codex','windsurf','kilocode','auggie','roo','q')]
    [string]$AgentType
)

$ErrorActionPreference = 'Stop'

# Импорт общих вспомогательных функций
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $ScriptDir 'common.ps1')

# Получение путей окружения
$envData = Get-FeaturePathsEnv
$REPO_ROOT     = $envData.REPO_ROOT
$CURRENT_BRANCH = $envData.CURRENT_BRANCH
$HAS_GIT       = $envData.HAS_GIT
$IMPL_PLAN     = $envData.IMPL_PLAN
$NEW_PLAN = $IMPL_PLAN

# Пути к файлам агентов
$CLAUDE_FILE   = Join-Path $REPO_ROOT 'CLAUDE.md'
$GEMINI_FILE   = Join-Path $REPO_ROOT 'GEMINI.md'
$COPILOT_FILE  = Join-Path $REPO_ROOT '.github/copilot-instructions.md'
$CURSOR_FILE   = Join-Path $REPO_ROOT '.cursor/rules/specify-rules.mdc'
$QWEN_FILE     = Join-Path $REPO_ROOT 'QWEN.md'
$AGENTS_FILE   = Join-Path $REPO_ROOT 'AGENTS.md'
$WINDSURF_FILE = Join-Path $REPO_ROOT '.windsurf/rules/specify-rules.md'
$KILOCODE_FILE = Join-Path $REPO_ROOT '.kilocode/rules/specify-rules.md'
$AUGGIE_FILE   = Join-Path $REPO_ROOT '.augment/rules/specify-rules.md'
$ROO_FILE      = Join-Path $REPO_ROOT '.roo/rules/specify-rules.md'
$Q_FILE        = Join-Path $REPO_ROOT 'AGENTS.md'

$TEMPLATE_FILE = Join-Path $REPO_ROOT '.specify/templates/agent-file-template.md'

# Заполнители для извлеченных данных плана
$script:NEW_LANG = ''
$script:NEW_FRAMEWORK = ''
$script:NEW_DB = ''
$script:NEW_PROJECT_TYPE = ''

function Write-Info { 
    param(
        [Parameter(Mandatory=$true)]
        [string]$Message
    )
    Write-Host "ИНФО: $Message" 
}

function Write-Success { 
    param(
        [Parameter(Mandatory=$true)]
        [string]$Message
    )
    Write-Host "$([char]0x2713) $Message" 
}

function Write-WarningMsg { 
    param(
        [Parameter(Mandatory=$true)]
        [string]$Message
    )
    Write-Warning $Message 
}

function Write-Err { 
    param(
        [Parameter(Mandatory=$true)]
        [string]$Message
    )
    Write-Host "ОШИБКА: $Message" -ForegroundColor Red 
}

function Validate-Environment {
    if (-not $CURRENT_BRANCH) {
        Write-Err 'Не удалось определить текущую функцию'
        if ($HAS_GIT) { Write-Info "Убедитесь, что вы находитесь на ветке функции" } else { Write-Info 'Установите переменную окружения SPECIFY_FEATURE или создайте функцию сначала' }
        exit 1
    }
    if (-not (Test-Path $NEW_PLAN)) {
        Write-Err "Файл plan.md не найден по пути $NEW_PLAN"
        Write-Info 'Убедитесь, что вы работаете над функцией с соответствующей директорией спецификации'
        if (-not $HAS_GIT) { Write-Info 'Используйте: $env:SPECIFY_FEATURE=название-функции или создайте новую функцию сначала' }
        exit 1
    }
    if (-not (Test-Path $TEMPLATE_FILE)) {
        Write-Err "Шаблонный файл не найден по пути $TEMPLATE_FILE"
        Write-Info 'Запустите specify init для создания шаблонов в .specify/templates, или добавьте agent-file-template.md туда.'
        exit 1
    }
}

function Extract-PlanField {
    param(
        [Parameter(Mandatory=$true)]
        [string]$FieldPattern,
        [Parameter(Mandatory=$true)]
        [string]$PlanFile
    )
    if (-not (Test-Path $PlanFile)) { return '' }
    # Строки вида **Язык/Версия**: Python 3.12
    $regex = "^\*\*$([Regex]::Escape($FieldPattern))\*\*: (.+)$"
    Get-Content -LiteralPath $PlanFile -Encoding utf8 | ForEach-Object {
        if ($_ -match $regex) { 
            $val = $Matches[1].Trim()
            if ($val -notin @('ТРЕБУЕТСЯ УТОЧНЕНИЕ','Н/Д')) { return $val }
        }
    } | Select-Object -First 1
}

function Parse-PlanData {
    param(
        [Parameter(Mandatory=$true)]
        [string]$PlanFile
    )
    if (-not (Test-Path $PlanFile)) { Write-Err "Файл плана не найден: $PlanFile"; return $false }
    Write-Info "Анализ данных плана из $PlanFile"
    $script:NEW_LANG        = Extract-PlanField -FieldPattern 'Язык/Версия' -PlanFile $PlanFile
    $script:NEW_FRAMEWORK   = Extract-PlanField -FieldPattern 'Основные зависимости' -PlanFile $PlanFile
    $script:NEW_DB          = Extract-PlanField -FieldPattern 'Хранилище' -PlanFile $PlanFile
    $script:NEW_PROJECT_TYPE = Extract-PlanField -FieldPattern 'Тип проекта' -PlanFile $PlanFile

    if ($NEW_LANG) { Write-Info "Обнаружен язык: $NEW_LANG" } else { Write-WarningMsg 'Информация о языке не найдена в плане' }
    if ($NEW_FRAMEWORK) { Write-Info "Обнаружены зависимости: $NEW_FRAMEWORK" }
    if ($NEW_DB -and $NEW_DB -ne 'Н/Д') { Write-Info "Обнаружено хранилище: $NEW_DB" }
    if ($NEW_PROJECT_TYPE) { Write-Info "Обнаружен тип проекта: $NEW_PROJECT_TYPE" }
    return $true
}

function Format-TechnologyStack {
    param(
        [Parameter(Mandatory=$false)]
        [string]$Lang,
        [Parameter(Mandatory=$false)]
        [string]$Framework
    )
    $parts = @()
    if ($Lang -and $Lang -ne 'ТРЕБУЕТСЯ УТОЧНЕНИЕ') { $parts += $Lang }
    if ($Framework -and $Framework -notin @('ТРЕБУЕТСЯ УТОЧНЕНИЕ','Н/Д')) { $parts += $Framework }
    if (-not $parts) { return '' }
    return ($parts -join ' + ')
}

function Get-ProjectStructure { 
    param(
        [Parameter(Mandatory=$false)]
        [string]$ProjectType
    )
    if ($ProjectType -match 'веб') { return "backend/`nfrontend/" } else { return "src/" } 
}

function Get-CommandsForLanguage { 
    param(
        [Parameter(Mandatory=$false)]
        [string]$Lang
    )
    switch -Regex ($Lang) {
        'Python' { return "cd src; запустить приложение" }
        'Rust' { return "cargo run" }
        'JavaScript|TypeScript' { return "npm start" }
        default { return "# Добавьте команды для $Lang" }
    }
}

function Get-LanguageConventions { 
    param(
        [Parameter(Mandatory=$false)]
        [string]$Lang
    )
    if ($Lang) { "${Lang}: Следуйте стандартным соглашениям" } else { 'Общее: Следуйте стандартным соглашениям' } 
}

function New-AgentFile {
    param(
        [Parameter(Mandatory=$true)]
        [string]$TargetFile,
        [Parameter(Mandatory=$true)]
        [string]$ProjectName,
        [Parameter(Mandatory=$true)]
        [datetime]$Date
    )
    if (-not (Test-Path $TEMPLATE_FILE)) { Write-Err "Шаблон не найден по пути $TEMPLATE_FILE"; return $false }
    $temp = New-TemporaryFile
    Copy-Item -LiteralPath $TEMPLATE_FILE -Destination $temp -Force

    $projectStructure = Get-ProjectStructure -ProjectType $NEW_PROJECT_TYPE
    $commands = Get-CommandsForLanguage -Lang $NEW_LANG
    $languageConventions = Get-LanguageConventions -Lang $NEW_LANG

    $escaped_lang = $NEW_LANG
    $escaped_framework = $NEW_FRAMEWORK
    $escaped_branch = $CURRENT_BRANCH

    $content = Get-Content -LiteralPath $temp -Raw -Encoding utf8
    $content = $content -replace '\[НАЗВАНИЕ ПРОЕКТА\]',$ProjectName
    $content = $content -replace '\[ДАТА\]',$Date.ToString('yyyy-MM-dd')
    
    # Безопасно формируем строку стека технологий
    $techStackForTemplate = ""
    if ($escaped_lang -and $escaped_framework) {
        $techStackForTemplate = "- $escaped_lang + $escaped_framework ($escaped_branch)"
    } elseif ($escaped_lang) {
        $techStackForTemplate = "- $escaped_lang ($escaped_branch)"
    } elseif ($escaped_framework) {
        $techStackForTemplate = "- $escaped_framework ($escaped_branch)"
    }
    
    $content = $content -replace '\[ИЗВЛЕЧЕНО ИЗ ВСЕХ PLAN.MD ФАЙЛОВ\]',$techStackForTemplate
    # Для структуры проекта внедряем вручную (сохраняем переносы строк)
    $escapedStructure = [Regex]::Escape($projectStructure)
    $content = $content -replace '\[СТРУКТУРА ПРОЕКТА\]',$escapedStructure
    # Заменяем плейсхолдер после всех замен
    $content = $content -replace '\[КОМАНДЫ\]',$commands
    $content = $content -replace '\[СТИЛЬ КОДА\]',$languageConventions
    
    # Безопасно формируем строку недавних изменений
    $recentChangesForTemplate = ""
    if ($escaped_lang -and $escaped_framework) {
        $recentChangesForTemplate = "- ${escaped_branch}: Добавлены ${escaped_lang} + ${escaped_framework}"
    } elseif ($escaped_lang) {
        $recentChangesForTemplate = "- ${escaped_branch}: Добавлен ${escaped_lang}"
    } elseif ($escaped_framework) {
        $recentChangesForTemplate = "- ${escaped_branch}: Добавлены ${escaped_framework}"
    }
    
    $content = $content -replace '\[ПОСЛЕДНИЕ ИЗМЕНЕНИЯ\]',$recentChangesForTemplate
    # Конвертируем литеральные последовательности \n в реальные переносы строк
    $content = $content -replace '\\n',[Environment]::NewLine

    $parent = Split-Path -Parent $TargetFile
    if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent | Out-Null }
    Set-Content -LiteralPath $TargetFile -Value $content -NoNewline -Encoding utf8
    Remove-Item $temp -Force
    return $true
}

function Update-ExistingAgentFile {
    param(
        [Parameter(Mandatory=$true)]
        [string]$TargetFile,
        [Parameter(Mandatory=$true)]
        [datetime]$Date
    )
    if (-not (Test-Path $TargetFile)) { return (New-AgentFile -TargetFile $TargetFile -ProjectName (Split-Path $REPO_ROOT -Leaf) -Date $Date) }

    $techStack = Format-TechnologyStack -Lang $NEW_LANG -Framework $NEW_FRAMEWORK
    $newTechEntries = @()
    if ($techStack) {
        $escapedTechStack = [Regex]::Escape($techStack)
        if (-not (Select-String -Pattern $escapedTechStack -Path $TargetFile -Quiet)) { 
            $newTechEntries += "- $techStack ($CURRENT_BRANCH)" 
        }
    }
    if ($NEW_DB -and $NEW_DB -notin @('Н/Д','ТРЕБУЕТСЯ УТОЧНЕНИЕ')) {
        $escapedDB = [Regex]::Escape($NEW_DB)
        if (-not (Select-String -Pattern $escapedDB -Path $TargetFile -Quiet)) { 
            $newTechEntries += "- $NEW_DB ($CURRENT_BRANCH)" 
        }
    }
    $newChangeEntry = ''
    if ($techStack) { $newChangeEntry = "- ${CURRENT_BRANCH}: Добавлены ${techStack}" }
    elseif ($NEW_DB -and $NEW_DB -notin @('Н/Д','ТРЕБУЕТСЯ УТОЧНЕНИЕ')) { $newChangeEntry = "- ${CURRENT_BRANCH}: Добавлено ${NEW_DB}" }

    $lines = Get-Content -LiteralPath $TargetFile -Encoding utf8
    $output = New-Object System.Collections.Generic.List[string]
    $inTech = $false; $inChanges = $false; $techAdded = $false; $changeAdded = $false; $existingChanges = 0

    for ($i=0; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        if ($line -eq '## Активные технологии') {
            $output.Add($line)
            $inTech = $true
            continue
        }
        if ($inTech -and $line -match '^##\s') {
            if (-not $techAdded -and $newTechEntries.Count -gt 0) { $newTechEntries | ForEach-Object { $output.Add($_) }; $techAdded = $true }
            $output.Add($line); $inTech = $false; continue
        }
        if ($inTech -and [string]::IsNullOrWhiteSpace($line)) {
            if (-not $techAdded -and $newTechEntries.Count -gt 0) { $newTechEntries | ForEach-Object { $output.Add($_) }; $techAdded = $true }
            $output.Add($line); continue
        }
        if ($line -eq '## Последние изменения') {
            $output.Add($line)
            if ($newChangeEntry) { $output.Add($newChangeEntry); $changeAdded = $true }
            $inChanges = $true
            continue
        }
        if ($inChanges -and $line -match '^##\s') { $output.Add($line); $inChanges = $false; continue }
        if ($inChanges -and $line -match '^- ') {
            if ($existingChanges -lt 2) { $output.Add($line); $existingChanges++ }
            continue
        }
        if ($line -match '\*\*Последнее обновление\*\*: .*\d{4}-\d{2}-\d{2}') {
            $output.Add(($line -replace '\d{4}-\d{2}-\d{2}',$Date.ToString('yyyy-MM-dd')))
            continue
        }
        $output.Add($line)
    }

    # Проверка после цикла: если мы все еще в разделе "Активные технологии" и не добавили новые записи
    if ($inTech -and -not $techAdded -and $newTechEntries.Count -gt 0) {
        $newTechEntries | ForEach-Object { $output.Add($_) }
    }

    Set-Content -LiteralPath $TargetFile -Value ($output -join [Environment]::NewLine) -Encoding utf8
    return $true
}

function Update-AgentFile {
    param(
        [Parameter(Mandatory=$true)]
        [string]$TargetFile,
        [Parameter(Mandatory=$true)]
        [string]$AgentName
    )
    if (-not $TargetFile -or -not $AgentName) { Write-Err 'Update-AgentFile требует TargetFile и AgentName'; return $false }
    Write-Info "Обновление файла контекста $AgentName: $TargetFile"
    $projectName = Split-Path $REPO_ROOT -Leaf
    $date = Get-Date

    $dir = Split-Path -Parent $TargetFile
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }

    if (-not (Test-Path $TargetFile)) {
        if (New-AgentFile -TargetFile $TargetFile -ProjectName $projectName -Date $date) { Write-Success "Создан новый файл контекста $AgentName" } else { Write-Err 'Не удалось создать новый файл агента'; return $false }
    } else {
        try {
            if (Update-ExistingAgentFile -TargetFile $TargetFile -Date $date) { Write-Success "Обновлен существующий файл контекста $AgentName" } else { Write-Err 'Не удалось обновить файл агента'; return $false }
        } catch {
            Write-Err "Не удалось получить доступ или обновить существующий файл: $TargetFile. $_"
            return $false
        }
    }
    return $true
}

function Update-SpecificAgent {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Type
    )
    switch ($Type) {
        'claude'   { Update-AgentFile -TargetFile $CLAUDE_FILE   -AgentName 'Claude Code' }
        'gemini'   { Update-AgentFile -TargetFile $GEMINI_FILE   -AgentName 'Gemini CLI' }
        'copilot'  { Update-AgentFile -TargetFile $COPILOT_FILE  -AgentName 'GitHub Copilot' }
        'cursor'   { Update-AgentFile -TargetFile $CURSOR_FILE   -AgentName 'Cursor IDE' }
        'qwen'     { Update-AgentFile -TargetFile $QWEN_FILE     -AgentName 'Qwen Code' }
        'opencode' { Update-AgentFile -TargetFile $AGENTS_FILE   -AgentName 'opencode' }
        'codex'    { Update-AgentFile -TargetFile $AGENTS_FILE   -AgentName 'Codex CLI' }
        'windsurf' { Update-AgentFile -TargetFile $WINDSURF_FILE -AgentName 'Windsurf' }
        'kilocode' { Update-AgentFile -TargetFile $KILOCODE_FILE -AgentName 'Kilo Code' }
        'auggie'   { Update-AgentFile -TargetFile $AUGGIE_FILE   -AgentName 'Auggie CLI' }
        'roo'      { Update-AgentFile -TargetFile $ROO_FILE      -AgentName 'Roo Code' }
        'q'        { Update-AgentFile -TargetFile $Q_FILE        -AgentName 'Amazon Q Developer CLI' }
        default { Write-Err "Неизвестный тип агента '$Type'"; Write-Err 'Ожидается: claude|gemini|copilot|cursor|qwen|opencode|codex|windsurf|kilocode|auggie|roo|q'; return $false }
    }
}

function Update-AllExistingAgents {
    $found = $false
    $ok = $true
    if (Test-Path $CLAUDE_FILE)   { if (-not (Update-AgentFile -TargetFile $CLAUDE_FILE   -AgentName 'Claude Code')) { $ok = $false }; $found = $true }
    if (Test-Path $GEMINI_FILE)   { if (-not (Update-AgentFile -TargetFile $GEMINI_FILE   -AgentName 'Gemini CLI')) { $ok = $false }; $found = $true }
    if (Test-Path $COPILOT_FILE)  { if (-not (Update-AgentFile -TargetFile $COPILOT_FILE  -AgentName 'GitHub Copilot')) { $ok = $false }; $found = $true }
    if (Test-Path $CURSOR_FILE)   { if (-not (Update-AgentFile -TargetFile $CURSOR_FILE   -AgentName 'Cursor IDE')) { $ok = $false }; $found = $true }
    if (Test-Path $QWEN_FILE)     { if (-not (Update-AgentFile -TargetFile $QWEN_FILE     -AgentName 'Qwen Code')) { $ok = $false }; $found = $true }
    if (Test-Path $AGENTS_FILE)   { if (-not (Update-AgentFile -TargetFile $AGENTS_FILE   -AgentName 'Codex/opencode')) { $ok = $false }; $found = $true }
    if (Test-Path $WINDSURF_FILE) { if (-not (Update-AgentFile -TargetFile $WINDSURF_FILE -AgentName 'Windsurf')) { $ok = $false }; $found = $true }
    if (Test-Path $KILOCODE_FILE) { if (-not (Update-AgentFile -TargetFile $KILOCODE_FILE -AgentName 'Kilo Code')) { $ok = $false }; $found = $true }
    if (Test-Path $AUGGIE_FILE)   { if (-not (Update-AgentFile -TargetFile $AUGGIE_FILE   -AgentName 'Auggie CLI')) { $ok = $false }; $found = $true }
    if (Test-Path $ROO_FILE)      { if (-not (Update-AgentFile -TargetFile $ROO_FILE      -AgentName 'Roo Code')) { $ok = $false }; $found = $true }
    if (Test-Path $Q_FILE)        { if (-not (Update-AgentFile -TargetFile $Q_FILE        -AgentName 'Amazon Q Developer CLI')) { $ok = $false }; $found = $true }
    if (-not $found) {
        Write-Info 'Не найдено существующих файлов агентов, создание файла Claude по умолчанию...'
        if (-not (Update-AgentFile -TargetFile $CLAUDE_FILE -AgentName 'Claude Code')) { $ok = $false }
    }
    return $ok
}

function Print-Summary {
    Write-Host ''
    Write-Info 'Сводка изменений:'
    if ($NEW_LANG) { Write-Host "  - Добавлен язык: $NEW_LANG" }
    if ($NEW_FRAMEWORK) { Write-Host "  - Добавлены зависимости: $NEW_FRAMEWORK" }
    if ($NEW_DB -and $NEW_DB -ne 'Н/Д') { Write-Host "  - Добавлено хранилище: $NEW_DB" }
    Write-Host ''
    Write-Info 'Использование: ./update-agent-context.ps1 [-AgentType claude|gemini|copilot|cursor|qwen|opencode|codex|windsurf|kilocode|auggie|roo|q]'
}

function Main {
    Validate-Environment
    Write-Info "=== Обновление файлов контекста агентов для функции $CURRENT_BRANCH ==="
    if (-not (Parse-PlanData -PlanFile $NEW_PLAN)) { Write-Err 'Не удалось проанализировать данные плана'; exit 1 }
    $success = $true
    if ($AgentType) {
        Write-Info "Обновление конкретного агента: $AgentType"
        if (-not (Update-SpecificAgent -Type $AgentType)) { $success = $false }
    }
    else {
        Write-Info 'Агент не указан, обновление всех существующих файлов агентов...'
        if (-not (Update-AllExistingAgents)) { $success = $false }
    }
    Print-Summary
    if ($success) { Write-Success 'Обновление контекста агентов завершено успешно'; exit 0 } else { Write-Err 'Обновление контекста агентов завершено с ошибками'; exit 1 }
}

Main