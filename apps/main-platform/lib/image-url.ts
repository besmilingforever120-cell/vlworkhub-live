export function resolveImageUrl(path?: string | null) {
  if (!path) return null;

  if (path.startsWith("http")) return path;

  const apiBaseUrl = String(process.env.NEXT_PUBLIC_API_URL || "https://api.vlworkhub.ca").replace(/\/+$/, "");

  const url = `${apiBaseUrl}${path}`;
  console.log("IMAGE URL:", url);
  return url;
}
