const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function readCookie(name: string): string | null {
  const value = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${name}=`))
    ?.split('=')[1];

  return value ? decodeURIComponent(value) : null;
}

export function writeCookie(name: string, value: string): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${COOKIE_MAX_AGE}; path=/; samesite=lax`;
}
