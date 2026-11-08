export function apiFrontmatter(raw: string): { data: Record<string, string>; body: string };
export function apiBody(body: string, siteUrl: string, options?: { markdownLinks?: boolean }): string;
