const API_URL = process.env.API_URL ?? 'http://localhost:3000';

export async function apiGet(path: string): Promise<string> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) {
    throw new Error(`GET ${path} failed with ${res.status}`);
  }
  return res.text();
}
