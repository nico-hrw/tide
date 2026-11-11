export function normalizePath(path: string): string {
  return path.replace(/^\/tide/, '') || '/';
}

export function isAuthOrLoginPath(path: string): boolean {
  const clean = normalizePath(path);
  return clean.startsWith('/auth') || clean.startsWith('/login');
}

export function getAuthPath(currentPath?: string): string {
  const p = currentPath ?? (typeof window !== 'undefined' ? window.location.pathname : '');
  return p.startsWith('/tide') ? '/tide/auth' : '/auth';
}

export function getHomePath(currentPath?: string): string {
  const p = currentPath ?? (typeof window !== 'undefined' ? window.location.pathname : '');
  return p.startsWith('/tide') ? '/tide' : '/';
}
