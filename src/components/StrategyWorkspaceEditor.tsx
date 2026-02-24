import { useMemo, useState } from 'react'
import Editor from '@monaco-editor/react'
import { strategyTemplates } from '../lib/strategyTemplates'

type StrategyWorkspaceEditorProps = {
  strategyCode: string
  strategyParams: Record<string, unknown>
  onStrategyCodeChange: (code: string) => void
  onStrategyParamsChange: (params: Record<string, unknown>) => void
}

type ParamType = 'string' | 'number' | 'boolean' | 'json'

type ParamRow = {
  id: string
  key: string
  type: ParamType
  value: string
}

type MonacoThemeApi = {
  editor: {
    defineTheme: (themeName: string, themeData: unknown) => void
  }
}

function inferType(value: unknown): ParamType {
  if (typeof value === 'number') {
    return 'number'
  }
  if (typeof value === 'boolean') {
    return 'boolean'
  }
  if (typeof value === 'object' && value !== null) {
    return 'json'
  }
  return 'string'
}

function serializeValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  try {
    return JSON.stringify(value ?? {}, null, 2)
  } catch {
    return ''
  }
}

function buildRows(params: Record<string, unknown>): ParamRow[] {
  return Object.entries(params).map(([key, value]) => ({
    id: crypto.randomUUID(),
    key,
    type: inferType(value),
    value: serializeValue(value),
  }))
}

function parseRows(rows: ParamRow[]): { parsed: Record<string, unknown>; errors: string[] } {
  const parsed: Record<string, unknown> = {}
  const errors: string[] = []

  for (const row of rows) {
    const key = row.key.trim()
    if (!key) {
      continue
    }

    try {
      switch (row.type) {
        case 'number': {
          const n = Number(row.value)
          if (!Number.isFinite(n)) {
            errors.push(`Param "${key}" is not a valid number.`)
          } else {
            parsed[key] = n
          }
          break
        }
        case 'boolean':
          parsed[key] = row.value.trim().toLowerCase() === 'true'
          break
        case 'json':
          parsed[key] = row.value.trim() ? JSON.parse(row.value) : {}
          break
        default:
          parsed[key] = row.value
      }
    } catch {
      errors.push(`Param "${key}" has invalid ${row.type} value.`)
    }
  }

  return { parsed, errors }
}

export function StrategyWorkspaceEditor({
  strategyCode,
  strategyParams,
  onStrategyCodeChange,
  onStrategyParamsChange,
}: StrategyWorkspaceEditorProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [rows, setRows] = useState<ParamRow[]>(() => buildRows(strategyParams))
  const [paramErrors, setParamErrors] = useState<string[]>([])

  const editorClass = isFullscreen ? 'strategy-editor fullscreen' : 'strategy-editor'
  const templates = useMemo(() => strategyTemplates, [])
  const themeName = 'quant-backtesting-dark'

  const setupMonacoTheme = (monaco: MonacoThemeApi) => {
    monaco.editor.defineTheme(themeName, {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '7C9CB8' },
        { token: 'keyword', foreground: '00D4FF' },
        { token: 'string', foreground: '00E676' },
        { token: 'number', foreground: 'B881FF' },
        { token: 'type.identifier', foreground: '6FDFFF' },
      ],
      colors: {
        'editor.background': '#0D1424',
        'editor.foreground': '#E8F0FE',
        'editorCursor.foreground': '#00D4FF',
        'editor.lineHighlightBackground': '#111F35',
        'editorLineNumber.foreground': '#3D5A7A',
        'editorLineNumber.activeForeground': '#7C9CB8',
        'editor.selectionBackground': '#1A3A60',
        'editor.inactiveSelectionBackground': '#132A45',
        'editorIndentGuide.background1': '#162540',
        'editorIndentGuide.activeBackground1': '#2A4E75',
      },
    })
  }

  const syncRowsToParams = (nextRows: ParamRow[]) => {
    setRows(nextRows)
    const { parsed, errors } = parseRows(nextRows)
    setParamErrors(errors)
    onStrategyParamsChange(parsed)
  }

  const addParamRow = () => {
    syncRowsToParams([...rows, { id: crypto.randomUUID(), key: '', type: 'string', value: '' }])
  }

  const removeParamRow = (id: string) => {
    syncRowsToParams(rows.filter((row) => row.id !== id))
  }

  const updateRow = (id: string, patch: Partial<ParamRow>) => {
    syncRowsToParams(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  const importTemplate = (templateId: string) => {
    const template = templates.find((item) => item.id === templateId)
    if (!template) {
      return
    }
    onStrategyCodeChange(template.code)
    onStrategyParamsChange(template.params)
    setRows(buildRows(template.params))
    setParamErrors([])
  }

  return (
    <section className={editorClass}>
      <div className="panel-title">Strategy Editor (single file)</div>
      <div className="strategy-toolbar">
        <select className="template-picker" onChange={(event) => importTemplate(event.target.value)} defaultValue="">
          <option value="" disabled>
            Import template...
          </option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
        <button className="btn" onClick={() => setIsFullscreen((prev) => !prev)}>
          {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        </button>
      </div>

      <div className="single-editor-layout">
        <div className="editor-pane">
          <div className="editor-file-header">strategy.py</div>
          <div className="editor-surface">
            <Editor
              height="100%"
              language="python"
              value={strategyCode}
              onChange={(value) => onStrategyCodeChange(value ?? '')}
              beforeMount={setupMonacoTheme}
              theme={themeName}
              options={{
                fontSize: 13,
                minimap: { enabled: false },
                smoothScrolling: true,
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          </div>
        </div>

        <aside className="params-pane">
          <div className="sidebar-title">Custom Parameters</div>
          <div className="params-list">
            {rows.map((row) => (
              <div key={row.id} className="param-row">
                <input
                  className="param-key"
                  placeholder="param_name"
                  value={row.key}
                  onChange={(event) => updateRow(row.id, { key: event.target.value })}
                />
                <select value={row.type} onChange={(event) => updateRow(row.id, { type: event.target.value as ParamType })}>
                  <option value="string">string</option>
                  <option value="number">number</option>
                  <option value="boolean">boolean</option>
                  <option value="json">json</option>
                </select>
                <input
                  className="param-value"
                  placeholder={row.type === 'json' ? '{"k":"v"}' : 'value'}
                  value={row.value}
                  onChange={(event) => updateRow(row.id, { value: event.target.value })}
                />
                <button className="btn param-remove" onClick={() => removeParamRow(row.id)}>
                  x
                </button>
              </div>
            ))}
          </div>
          <div className="param-actions">
            <button className="btn" onClick={addParamRow}>
              Add Param
            </button>
          </div>
          {paramErrors.length > 0 ? (
            <div className="param-errors">
              {paramErrors.map((error) => (
                <div key={error}>{error}</div>
              ))}
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  )
}
