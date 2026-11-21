// The "current request" of a test: only its Cookie header matters to the server code.
let cookie: string | null = null;

export function setRequestCookie(value: string | null): void {
  cookie = value;
}

export function requestHeaders(): Headers {
  return new Headers(cookie ? { cookie } : {});
}
