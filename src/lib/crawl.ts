import { isSameOrigin, normalizeUrl, shouldSkipCrawlUrl } from "@/lib/url";

export type QueueItem = {
  url: string;
  depth: number;
};

export function enqueueLinks(
  queue: QueueItem[],
  seen: Set<string>,
  links: string[],
  originUrl: string,
  depth: number,
  maxDepth: number,
) {
  if (depth >= maxDepth) {
    return;
  }

  for (const link of links) {
    if (shouldSkipCrawlUrl(link) || !isSameOrigin(link, originUrl)) {
      continue;
    }

    const normalized = normalizeUrl(link);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      queue.push({ url: normalized, depth: depth + 1 });
    }
  }
}
