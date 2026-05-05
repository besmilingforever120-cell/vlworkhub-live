export function resolveImageUrl(path?: string | null) {
  if (!path) return null;

  if (path.startsWith("http")) return path;

  const apiBaseUrl = String(process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");
  if (!apiBaseUrl) {
    return path;
  }

  return `${apiBaseUrl}${path}`;
}
