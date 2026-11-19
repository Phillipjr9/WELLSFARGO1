// Destination resolution for links inside the captured public pages.
//
// The catalog holds the real markup of every captured public page. Some of the
// links in that markup point at pages that were not captured (deeper articles,
// press releases, resource centers) and a few of them are enhanced by Wells
// Fargo's own JavaScript, which is not part of the capture (lightbox exit
// dialogs, balloon-help tooltips, footnote overlays). This module resolves
// every one of those destinations to something that works: a captured page, a
// clearly labelled section of the nearest captured parent page, or the real
// public URL.

export const SOURCE_HOST = "www.wellsfargo.com";

/** Public hosts whose captured pages are served under a local route prefix. */
export const SECTION_PREFIXES: Record<string, string> = {
  "creditcards.wellsfargo.com": "/credit-cards",
  "getmoneyready.wf.com": "/guidance",
  "stories.wf.com": "/stories",
};

/** Hosts that are only reachable on the official site (no local capture). */
export const EXTERNAL_ONLY_HOSTS = new Set([
  "apply.wellsfargo.com",
  "web.secure.wellsfargo.com",
  "connect.secure.wellsfargo.com",
  "oam.wellsfargo.com",
  "accountoffers.wellsfargo.com",
  "appointments.wellsfargo.com",
  "icomplete.wellsfargo.com",
  "confirmcard.wellsfargo.com",
  "locations.wellsfargo.com",
  "locations.wellsfargoadvisors.com",
  "privacycenter.wellsfargo.com",
  "homeloans.wellsfargo.com",
  "www.wellsfargoadvisors.com",
  "join.wellsfargoadvisors.com",
  "smallbusinessresources.wf.com",
  "www.wellsfargojobs.com",
  "sites.wf.com",
  "www.wellsfargomedia.com",
  "www17.wellsfargomedia.com",
]);

export function normalizeRoute(path: string): string {
  return path.split("#")[0].split("?")[0].replace(/\/+$/, "") || "/";
}

/**
 * Maps an absolute public URL to the local route that serves that page, using
 * the same prefixes as the capture script.
 */
export function localRouteFor(url: URL): string | null {
  const prefix = SECTION_PREFIXES[url.hostname];
  if (prefix) return normalizeRoute(`${prefix}${url.pathname}`);
  if (url.hostname === SOURCE_HOST || url.hostname === "wellsfargo.com")
    return normalizeRoute(url.pathname);
  return null;
}

export type DestinationKind = "page" | "external" | "document" | "internal";

export type Destination = {
  kind: DestinationKind;
  /** Local route to open, for captured pages and numbered fallbacks. */
  route?: string;
  /** Absolute public URL, for pages that only exist on the official site. */
  url?: string;
  /** Section anchor on a captured parent page when the exact page is absent. */
  hash?: string;
  /** Query string carried over from the original link. */
  search?: string;
  /** True when the exact page was not captured and the parent page is shown. */
  fallback?: boolean;
};

const DOCUMENT = /\.(pdf|zip|docx?|xlsx?|pptx?|csv|ics)$/i;

export function slugifyTitle(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function parentRoute(route: string): string {
  const parts = route.split("/").filter(Boolean);
  while (parts.length > 0) {
    parts.pop();
    if (parts.length === 0) return "/";
    const candidate = `/${parts.join("/")}`;
    if (candidate !== route) return candidate;
  }
  return "/";
}

/**
 * Resolves a raw href found in a captured page.
 *
 * `captured` is the set of local routes that have a stored page: it decides
 * whether a link can be served locally or has to fall back.
 */
export function resolveHref(
  rawHref: string,
  baseUrl: string,
  captured: (route: string) => boolean,
  alias?: (route: string) => { route: string; hash?: string; fallback?: boolean } | undefined,
  official?: (route: string) => string | undefined,
): Destination {
  const raw = rawHref.replace(/&amp;/g, "&").trim();
  if (!raw || raw === "#") return { kind: "internal" };
  let url: URL;
  try {
    url = new URL(raw, baseUrl);
  } catch {
    return { kind: "internal" };
  }
  const search = url.search || undefined;

  if (DOCUMENT.test(url.pathname)) return { kind: "document", url: url.href };

  // "Share this page" goes through a redirector that no longer resolves; the
  // real destination is the social network's own share URL.
  if (/^\/exit\/social\/?$/.test(url.pathname)) {
    const site = url.searchParams.get("site") || "";
    const share: Record<string, string> = {
      facebook: `https://www.facebook.com/sharer.php?u=${encodeURIComponent(sourceUrlFor("/"))}`,
      twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(sourceUrlFor("/"))}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(sourceUrlFor("/"))}`,
    };
    if (share[site]) return { kind: "external", url: share[site] };
  }

  if (url.hostname !== SOURCE_HOST && !SECTION_PREFIXES[url.hostname]) {
    return { kind: "external", url: url.href };
  }

  const route = localRouteFor(url);
  if (!route) return { kind: "external", url: url.href };

  // A captured page wins, including its own in-page anchors.
  if (captured(route)) return { kind: "page", route, search, hash: url.hash || undefined };

  // A destination with no captured equivalent announces itself as an official
  // hand-off, so the reader is not dropped onto unrelated content.
  const officialFor = official?.(route);
  if (officialFor && !captured(route)) return { kind: "external", url: officialFor };

  const mapped = alias?.(route);
  if (mapped && captured(mapped.route)) {
    return {
      kind: "page",
      route: mapped.route,
      search,
      hash: mapped.hash || url.hash || undefined,
      fallback: mapped.route !== route,
    };
  }

  // Anything else resolves to a numbered section of the nearest captured
  // parent page, so every link still lands on real source content.
  let parent = route;
  for (let i = 0; i < 12; i += 1) {
    parent = parentRoute(parent);
    if (captured(parent)) {
      return { kind: "page", route: parent, search, fallback: true };
    }
    if (parent === "/") break;
  }
  return { kind: "external", url: url.href };
}

/** Public URL of a captured route, used by the "open the official page" links. */
export function sourceUrlFor(route: string): string {
  const normalized = normalizeRoute(route);
  if (normalized === "/credit-cards" || normalized.startsWith("/credit-cards/"))
    return `https://creditcards.wellsfargo.com${normalized.slice(13) || "/"}`;
  if (normalized === "/guidance" || normalized.startsWith("/guidance/"))
    return `https://getmoneyready.wf.com${normalized.slice(9) || "/"}`;
  if (normalized === "/stories" || normalized.startsWith("/stories/"))
    return `https://stories.wf.com${normalized.slice(8) || "/"}`;
  if (normalized === "/careers") return "https://www.wellsfargojobs.com/";
  return `https://${SOURCE_HOST}${normalized === "/" ? "/" : `${normalized}/`}`;
}
