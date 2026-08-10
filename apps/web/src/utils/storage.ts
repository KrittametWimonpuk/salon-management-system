const BRANCH_KEY_PREFIX = 'salon.branch.'
const THEME_KEY = 'salon.theme'

export type ThemePreference = 'light' | 'dark' | 'system'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Preferences are optional; authentication never depends on browser storage.
  }
}

export const preferenceStorage = {
  getBranch(organizationId: string): string | null {
    return read(`${BRANCH_KEY_PREFIX}${organizationId}`)
  },
  setBranch(organizationId: string, branchId: string | null): void {
    write(`${BRANCH_KEY_PREFIX}${organizationId}`, branchId)
  },
  getTheme(): ThemePreference {
    const value = read(THEME_KEY)
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
  },
  setTheme(theme: ThemePreference): void {
    write(THEME_KEY, theme)
  },
}
