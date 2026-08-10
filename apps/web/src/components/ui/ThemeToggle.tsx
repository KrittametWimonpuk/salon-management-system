import { Monitor, Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { preferenceStorage, type ThemePreference } from '../../utils/storage'

const options: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'ธีมสว่าง', icon: Sun },
  { value: 'dark', label: 'ธีมมืด', icon: Moon },
  { value: 'system', label: 'ตามระบบ', icon: Monitor },
]

function applyTheme(theme: ThemePreference): void {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', theme)
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemePreference>(() => preferenceStorage.getTheme())

  useEffect(() => { applyTheme(theme) }, [theme])

  return (
    <div className="theme-toggle" role="radiogroup" aria-label="รูปแบบสี">
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          className={theme === value ? 'active' : ''}
          type="button"
          role="radio"
          aria-checked={theme === value}
          title={label}
          onClick={() => {
            preferenceStorage.setTheme(value)
            setTheme(value)
          }}
        >
          <Icon size={16} aria-hidden="true" />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  )
}
