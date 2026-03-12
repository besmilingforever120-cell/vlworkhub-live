export function stripHtml(html: string): string {
  return html ? html.replace(/<[^>]+>/g, '') : '';
}

export function getTimeAgo(dateString: string): string {
  try {
    const now = new Date();
    const past = new Date(dateString);
    const diffH = Math.floor((now.getTime() - past.getTime()) / (1000 * 60 * 60));

    if (diffH < 1) return 'Just now';
    if (diffH < 24) return `${diffH}h ago`;

    const d = Math.floor(diffH / 24);
    return `${d}d ago`;
  } catch {
    return 'Recently';
  }
}