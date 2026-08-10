export function displayName(name: string | null | undefined, email: string): string {
  return name?.trim() || email
}
