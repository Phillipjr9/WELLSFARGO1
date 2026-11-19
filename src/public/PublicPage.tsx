import { useEffect, useRef, useState } from "react";
import { ExternalLink, RotateCw } from "lucide-react";
import globalSourceCss from "./public-global.css?raw";
import { catalogData } from "./catalog-data";
import { styleData } from "./style-data";
import linkIndexData from "./link-index.json";
import { useRouter } from "../router/RouterContext";
import { resolveHref, sourceUrlFor } from "./links";
import checkingDesktop from "../assets/checking-desktop.jpg";
import checkingTablet from "../assets/checking-tablet.jpg";
import checkingMobile from "../assets/checking-mobile.jpg";

export type PublicPageRecord = {
  source: string;
  title: string;
  html: string;
  styles: string[];
  status: number;
};

async function inflate(base64: string): Promise<string> {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

type IndexEntry = { route?: string; fallback?: boolean; official?: string };
const linkIndex = linkIndexData as unknown as Record<string, IndexEntry>;

export function hasCapturedPage(route: string): boolean {
  return Boolean(catalogData[route]);
}

/** Local route that actually serves a destination, following the index. */
export function servedRoute(route: string): string | undefined {
  if (hasCapturedPage(route)) return route;
  return aliasFor(route)?.route;
}

/** Follows chained aliases from the destination index to a captured route. */
function aliasFor(route: string): { route: string; fallback?: boolean } | undefined {
  let current = route;
  for (let step = 0; step < 4; step += 1) {
    const entry = linkIndex[current];
    if (!entry || !entry.route) return undefined;
    if (hasCapturedPage(entry.route)) return { route: entry.route, fallback: entry.fallback };
    current = entry.route;
  }
  return undefined;
}

/** Public URL for a destination that only exists on the official site. */
function officialFor(route: string): string | undefined {
  return linkIndex[route]?.official;
}

/** Number of un-captured pages that still need a page on a given route. */
export function unlinkedCount(route: string): number {
  let count = 0;
  for (const entry of Object.values(linkIndex)) {
    if (entry.route === route && entry.fallback) count += 1;
  }
  return count;
}

const pageCache = new Map<string, Promise<PublicPageRecord>>();
const styleCache = new Map<string, Promise<string>>();

function loadCachedPage(route: string): Promise<PublicPageRecord> {
  let work = pageCache.get(route);
  if (!work) {
    const packed = catalogData[route];
    if (!packed) return Promise.reject(new Error("No saved page for this route."));
    work = inflate(packed).then((text) => JSON.parse(text) as PublicPageRecord);
    pageCache.set(route, work);
  }
  return work;
}

function loadSourceStyle(url: string): Promise<string> {
  let work = styleCache.get(url);
  if (!work) {
    const packed = styleData[url];
    if (!packed) return Promise.reject(new Error("No saved stylesheet."));
    work = inflate(packed);
    styleCache.set(url, work);
  }
  return work;
}
export function officialSource(path: string) {
  const normalized = `/${path.replace(/^\/+|\/+$/g, "")}/`.replace("//", "/");
  if (normalized === "/home/") return "https://www.wellsfargo.com/";
  if (normalized.startsWith("/credit-cards/")) return `https://creditcards.wellsfargo.com${normalized.slice(13) || "/"}`;
  if (normalized.startsWith("/guidance/")) return `https://getmoneyready.wf.com${normalized.slice(9) || "/"}`;
  if (normalized.startsWith("/stories/")) return `https://stories.wf.com${normalized.slice(8) || "/"}`;
  if (normalized === "/careers/" || normalized === "/jobs/") return "https://www.wellsfargojobs.com/";
  if (normalized === "/espanol/") return "https://www.wellsfargo.com/es/";
  if (normalized === "/savings/") return "https://www.wellsfargo.com/savings-cds/";
  if (normalized === "/cds/") return "https://www.wellsfargo.com/savings-cds/certificate-of-deposit/";
  if (normalized === "/home-loans/") return "https://www.wellsfargo.com/mortgage/";
  if (normalized === "/business/") return "https://www.wellsfargo.com/biz/";
  if (normalized === "/commercial/") return "https://www.wellsfargo.com/com/";
  if (normalized === "/corporate/") return "https://www.wellsfargo.com/cib/";
  if (normalized === "/investing/") return "https://www.wellsfargo.com/investing-wealth/";
  if (normalized === "/lifesync/") return "https://www.wellsfargo.com/mobile-online-banking/lifesync/";
  if (normalized === "/routing-number/") return "https://www.wellsfargo.com/help/routing-number/";
  if (normalized === "/rates/") return "https://www.wellsfargo.com/help/rates/";
  if (normalized === "/sign-on/" || normalized === "/login/") return "https://connect.secure.wellsfargo.com/auth/login/present?origin=cob&LOB=CONS";
  if (normalized === "/locations/") return "https://locations.wellsfargo.com/search";
  if (normalized === "/appointments/") return "https://appointments.wellsfargo.com/maa/appointment/";
  return `https://www.wellsfargo.com${normalized}`;
}

// The source pages' interactive widgets run on Wells Fargo's own JavaScript,
// which is not included. These handlers restore the basic behavior the public
// markup describes: tab panels, footnote dialogs, and search category filters.
function wireTabs(root: ShadowRoot) {
  const activate = (tab: Element) => {
    const group = tab.closest('[role="tablist"]') || tab.parentElement;
    const tabs = Array.from(group?.querySelectorAll('[role="tab"]') ?? [tab]);
    tabs.forEach((t) => {
      const selected = t === tab;
      t.setAttribute("aria-selected", String(selected));
      t.setAttribute("tabindex", selected ? "0" : "-1");
      const panelId = t.getAttribute("aria-controls");
      const panel = panelId ? root.getElementById(panelId) : null;
      if (panel) panel.classList.toggle("is-tab-hidden", !selected);
    });
  };
  const onClick = (event: Event) => {
    const tab = event.target instanceof Element ? event.target.closest('[role="tab"]') : null;
    if (tab) activate(tab);
  };
  const onKey = (event: Event) => {
    if (!(event instanceof KeyboardEvent)) return;
    const tab = event.target instanceof Element ? event.target.closest('[role="tab"]') : null;
    if (!tab || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    const group = tab.closest('[role="tablist"]') || tab.parentElement;
    const tabs = Array.from(group?.querySelectorAll('[role="tab"]') ?? []);
    const index = tabs.indexOf(tab);
    if (index < 0 || tabs.length < 2) return;
    event.preventDefault();
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    (tabs[next] as HTMLElement).focus();
    activate(tabs[next]);
  };
  root.addEventListener("click", onClick);
  root.addEventListener("keydown", onKey);
  return () => {
    root.removeEventListener("click", onClick);
    root.removeEventListener("keydown", onKey);
  };
}

function wireFootnotes(root: ShadowRoot) {
  const onClick = (event: Event) => {
    const link = event.target instanceof Element ? event.target.closest('a[href^="#tcm:"]') : null;
    if (!link) return;
    const id = (link.getAttribute("href") || "").slice(1);
    const target = id ? root.getElementById(id) : null;
    if (!target || !target.classList.contains("ps-footnote-text")) return;
    event.preventDefault();
    event.stopPropagation();
    const dialog = document.createElement("dialog");
    dialog.className = "footnote-dialog";
    dialog.setAttribute("aria-label", link.getAttribute("aria-label") || "Footnote");
    const close = document.createElement("button");
    close.type = "button";
    close.className = "footnote-dialog-close";
    close.textContent = "×";
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", () => dialog.close());
    const body = target.cloneNode(true) as HTMLElement;
    body.removeAttribute("id");
    dialog.append(close, body);
    dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener("close", () => dialog.remove());
    root.appendChild(dialog);
    dialog.showModal();
    close.focus();
  };
  root.addEventListener("click", onClick);
  return () => root.removeEventListener("click", onClick);
}

function wireSearchFilters(root: ShadowRoot, onCount?: (visible: number, total: number) => void) {
  const boxes = Array.from(root.querySelectorAll('[role="checkbox"]'));
  if (!boxes.length) return () => {};
  const results = Array.from(root.querySelectorAll('[class*="FusionResultsTextTiles__link"]'))
    .map((link) => {
      const card = link.closest('[class*="WFListItem"]') || link.closest("li") || link.parentElement;
      const category = card?.querySelector('[class*="FusionResultsTextTiles__category"]')?.textContent?.trim() || "";
      return { card, category };
    })
    .filter((r): r is { card: Element; category: string } => Boolean(r.card && r.category));
  const applyFilter = () => {
    const checked = new Set(
      boxes.filter((b) => b.getAttribute("aria-checked") === "true").map((b) => b.textContent?.trim() || ""),
    );
    let visible = 0;
    results.forEach(({ card, category }) => {
      const show = checked.has(category);
      (card as HTMLElement).style.display = show ? "" : "none";
      if (show) visible += 1;
    });
    onCount?.(visible, results.length);
  };
  const toggle = (box: Element) => {
    const next = box.getAttribute("aria-checked") !== "true";
    box.setAttribute("aria-checked", String(next));
    const icon = box.querySelector('[class*="CheckboxIcon__checkbox"]');
    icon?.classList.forEach((cls) => {
      if (cls.startsWith("CheckboxIcon__checked")) icon.classList.toggle(cls, next);
    });
    if (next && icon && ![...icon.classList].some((c) => c.startsWith("CheckboxIcon__checked"))) {
      // The hashed class is present in the loaded stylesheet; recover its name from the capture's other state.
      const anyChecked = root.querySelector('[class*="CheckboxIcon__checked"]');
      const cls = anyChecked ? [...anyChecked.classList].find((c) => c.startsWith("CheckboxIcon__checked")) : undefined;
      if (cls) icon.classList.add(cls);
    }
    applyFilter();
  };
  // The live search page starts with every category checked; the capture stores
  // them unchecked, so initialize to the live default before wiring.
  boxes.forEach((b) => {
    if (b.getAttribute("aria-checked") !== "true") toggle(b);
  });
  const onClick = (event: Event) => {
    const box = event.target instanceof Element ? event.target.closest('[role="checkbox"]') : null;
    if (box) toggle(box);
  };
  const onKey = (event: Event) => {
    if (!(event instanceof KeyboardEvent) || ![" ", "Enter"].includes(event.key)) return;
    const box = event.target instanceof Element ? event.target.closest('[role="checkbox"]') : null;
    if (box) { event.preventDefault(); toggle(box); }
  };
  root.addEventListener("click", onClick);
  root.addEventListener("keydown", onKey);
  applyFilter();
  return () => {
    root.removeEventListener("click", onClick);
    root.removeEventListener("keydown", onKey);
  };
}


// ---------------------------------------------------------------------------
// Interactions the source markup describes but whose behaviour lived in Wells
// Fargo's own JavaScript (not part of the capture): footnote references,
// balloon-help definitions, the share pop-up, the print link, feedback survey
// and the image/rate carousels.
// ---------------------------------------------------------------------------

function xmlEscape(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sourceDialog(root: ShadowRoot, title: string, body: HTMLElement | string): HTMLDialogElement {
  root.querySelector("dialog.source-dialog")?.remove();
  const dialog = document.createElement("dialog");
  dialog.className = "footnote-dialog source-dialog";
  dialog.setAttribute("aria-label", title);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "footnote-dialog-close";
  close.textContent = "\u00d7";
  close.setAttribute("aria-label", "Close");
  close.addEventListener("click", () => dialog.close());
  const heading = document.createElement("h2");
  heading.className = "source-dialog-title";
  heading.textContent = title;
  const content = document.createElement("div");
  content.className = "source-dialog-body";
  if (typeof body === "string") content.innerHTML = body;
  else content.appendChild(body);
  dialog.append(close, heading, content);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => dialog.remove());
  root.appendChild(dialog);
  dialog.showModal();
  close.focus();
  return dialog;
}

/**
 * Footnote references. The source markup offers three flavours:
 *   * `data-fn="#fn1"` -> a numbered note in `<div id="fn1">`
 *   * `data-fn="#fn*"` -> a symbol note stored under `data-footnote-id`
 *   * a bare `href="#question"` inside an FAQ accordion -> the summary itself
 * Each one opens what the source page shows for it.
 */
function wireFootnoteRefs(root: ShadowRoot) {
  const disclosureFor = (id: string): Element | null => {
    if (!id) return null;
    const byId = root.getElementById(id);
    if (byId) return byId;
    const escaped = id.replace(/["\\]/g, "\\$&");
    return root.querySelector(`[data-disclosure-id="${escaped}"]`)
      ?? root.querySelector(`[data-content-id="${escaped}"]`);
  };
  const onClick = (event: Event) => {
    const link = event.target instanceof Element
      ? event.target.closest('a[data-fn], a.fn-ref, a[href^="#fn"], a[data-footnote-id]')
      : null;
    if (!link) return;
    const footnoteId = link.getAttribute("data-footnote-id") || "";
    const target = (link.getAttribute("data-fn") || link.getAttribute("href") || "").replace(/^#/, "");
    const note = disclosureFor(footnoteId) ?? (target ? root.getElementById(target) : null);
    if (!note) return;
    event.preventDefault();
    const details = note.closest("details");
    if (details instanceof HTMLDetailsElement) details.open = true;
    const isLong = (note.textContent || "").trim().length > 260;
    if (isLong || link.getAttribute("aria-haspopup") === "dialog") {
      sourceDialog(root, "Footnote", xmlEscape(note.innerHTML));
      return;
    }
    note.scrollIntoView({ behavior: "smooth", block: "center" });
    note.classList.add("source-footnote-highlight");
    window.setTimeout(() => note.classList.remove("source-footnote-highlight"), 2200);
  };
  root.addEventListener("click", onClick);
  return () => root.removeEventListener("click", onClick);
}

/**
 * FAQ accordions mark every question with `<a href="#question-slug">` inside
 * the `<summary>`. Their markup carries no matching id, so the link must open
 * the answer it sits in instead of doing nothing.
 */
function wireFaqAnchors(root: ShadowRoot) {
  const onClick = (event: Event) => {
    const link = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
    if (!link) return;
    const id = (link.getAttribute("href") || "").slice(1);
    if (!id || root.getElementById(id)) return;
    const summary = link.closest("summary");
    if (!summary) return;
    event.preventDefault();
    const details = summary.closest("details") as HTMLDetailsElement | null;
    if (!details) return;
    details.open = !details.open;
    summary.setAttribute("aria-expanded", String(details.open));
    if (details.open) details.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  root.addEventListener("click", onClick);
  return () => root.removeEventListener("click", onClick);
}

/** Legacy accordions (`href="#Expand"` on the question heading). */
function wireLegacyAccordions(root: ShadowRoot) {
  const onClick = (event: Event) => {
    const link = event.target instanceof Element ? event.target.closest('a[href="#Expand"], a[href="#Collapse"]') : null;
    if (!link) return;
    const heading = link.closest("h2, h3, h4, .c58question") ?? link;
    const panel = heading.parentElement?.querySelector(".c58answer, .wf-acc-content, [class*='answer']")
      ?? heading.nextElementSibling;
    if (!(panel instanceof HTMLElement)) return;
    event.preventDefault();
    const expanded = link.getAttribute("aria-expanded") === "true";
    link.setAttribute("aria-expanded", String(!expanded));
    link.setAttribute("href", expanded ? "#Expand" : "#Collapse");
    const icon = heading.querySelector(".wf-acc-icon") as HTMLImageElement | null;
    if (icon) icon.style.transform = expanded ? "" : "rotate(45deg)";
    heading.classList.toggle("open", !expanded);
    heading.classList.toggle("close", expanded);
    panel.classList.toggle("close", expanded);
    panel.hidden = expanded;
  };
  root.addEventListener("click", onClick);
  return () => root.removeEventListener("click", onClick);
}

/**
 * The source sign-on card stays intact visually, but its form is only a safe
 * hand-off: inputs never leave the page and submission opens the official sign-in.
 */
function wireSignon(root: ShadowRoot, officialSignOn: string) {
  const card = root.querySelector<HTMLElement>(".signon-container");
  if (!card) return () => {};
  card.setAttribute("data-wf-offline-signon", "");
  const form = card.querySelector<HTMLFormElement>("form#frmSignon, form[name='signon']");

  // Keep the explanation in the accessibility tree without changing the source
  // card at rest. Reveal it visually as soon as someone focuses the form, before
  // they can type credentials into this offline copy.
  let note = card.querySelector<HTMLElement>("[data-wf-signon-note]");
  if (!note) {
    note = document.createElement("p");
    note.setAttribute("data-wf-signon-note", "");
    note.id = "signon-note";
    note.className = "wf-signon-note";
    note.innerHTML =
      'Offline copy of wellsfargo.com. Nothing you type here is sent or stored. ' +
      `<a href="${officialSignOn}" target="_blank" rel="noreferrer">Sign on at the official site</a>.`;
    (form || card).appendChild(note);
  }
  for (const field of card.querySelectorAll<HTMLInputElement>("input:not([type='hidden'])")) {
    field.setAttribute("aria-describedby", "signon-note");
  }
  const onFocusIn = () => note?.classList.add("is-visible");
  card.addEventListener("focusin", onFocusIn);

  const onSubmit = (event: Event) => {
    // Never post a card on a copy of the page: send the reader to the bank.
    event.preventDefault();
    event.stopPropagation();
    window.open(officialSignOn, "_blank", "noopener,noreferrer");
  };
  form?.addEventListener("submit", onSubmit);

  return () => {
    card.removeEventListener("focusin", onFocusIn);
    form?.removeEventListener("submit", onSubmit);
  };
}

/** Tooltips the source closes with a small `a.tooltip-close-icon` control. */
function wireTooltips(root: ShadowRoot) {
  const onClick = (event: Event) => {
    const close = event.target instanceof Element ? event.target.closest("a.tooltip-close-icon") : null;
    if (!close) return;
    event.preventDefault();
    const panel = close.closest(".tooltip, .c29balloon, [class*='tooltip']") as HTMLElement | null;
    if (panel) panel.style.display = "none";
  };
  root.addEventListener("click", onClick);
  const cleaner = () => {
    // Anchors the source renders without any destination are controls: make
    // sure they are reachable and never present themselves as links.
    root.querySelectorAll("a:not([href])").forEach((element) => {
      const anchor = element as HTMLAnchorElement;
      if (!anchor.hasAttribute("role")) anchor.setAttribute("role", "button");
      if (!anchor.hasAttribute("tabindex")) anchor.setAttribute("tabindex", "0");
    });
  };
  const timer = window.setTimeout(cleaner, 0);
  return () => {
    window.clearTimeout(timer);
    root.removeEventListener("click", onClick);
  };
}

/** "←back to content" links inside the footnote lists. */
function wireFootnoteBack(root: ShadowRoot) {
  const onClick = (event: Event) => {
    const link = event.target instanceof Element ? event.target.closest("a.fns, a[data-footnote]") : null;
    if (!link) return;
    event.preventDefault();
    const notes = link.closest("li, .fn-target, .fns") ?? link;
    const ref = root.querySelector("[data-fn]");
    (notes instanceof HTMLElement ? notes : (ref ?? link))?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (ref instanceof HTMLElement) ref.focus?.();
  };
  root.addEventListener("click", onClick);
  return () => root.removeEventListener("click", onClick);
}

/**
 * Balloon-help links open their definition. The definition lives in the source
 * markup under the id in `data-content-id` when the capture includes it; when
 * it does not, the surrounding heading and table row text still describe the
 * term, so the dialog shows that plus a link to the official page.
 */
function wireBalloonHelp(root: ShadowRoot, pageSource: string) {
  const onClick = (event: Event) => {
    const link = event.target instanceof Element
      ? event.target.closest('a[type="balloonhelp"], a[data-content-id], a.c29link[role="button"]')
      : null;
    if (!link) return;
    event.preventDefault();
    const id = link.getAttribute("data-content-id") || "";
    const definition = id ? root.getElementById(id) : null;
    if (definition && definition !== link) {
      sourceDialog(root, link.textContent?.trim() || "Definition", xmlEscape(definition.innerHTML));
      return;
    }
    const term = (link.textContent || "").replace(/\s+/g, " ").trim();
    const row = link.closest("tr, .flexContainerRow, li, p");
    const context = (row?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 320);
    sourceDialog(
      root,
      term || "Definition",
      `<p>${xmlEscape(context || term)}</p><p class="source-dialog-note">The full definition for this term is on the official page.</p>` +
        `<p><a class="wf-button wf-button-red" href="${pageSource}" target="_blank" rel="noreferrer">Open the official page</a></p>`,
    );
  };
  root.addEventListener("click", onClick);
  const onKey = (event: Event) => {
    if (!(event instanceof KeyboardEvent) || !["Enter", " "].includes(event.key)) return;
    const link = event.target instanceof Element ? event.target.closest('a[type="balloonhelp"]') : null;
    if (link) onClick(event);
  };
  root.addEventListener("keydown", onKey);
  return () => {
    root.removeEventListener("click", onClick);
    root.removeEventListener("keydown", onKey);
  };
}

/** The legacy "Share this page" pop-up and the print link. */
function wirePageUtilities(root: ShadowRoot) {
  const onClick = (event: Event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const print = target.closest("a.printLink, .sideUtility .printLink");
    if (print) {
      event.preventDefault();
      window.print();
      return;
    }
    const opener = target.closest("a.PopupOpener");
    if (!opener) return;
    event.preventDefault();
    const region = root.querySelector('.c52.hide, .c52[role="region"]') as HTMLElement | null;
    if (!region) return;
    const body = region.cloneNode(true) as HTMLElement;
    body.classList.remove("hide");
    body.removeAttribute("aria-hidden");
    sourceDialog(root, "Share this page", xmlEscape(body.innerHTML));
    const expanded = opener.getAttribute("aria-expanded") === "true";
    opener.setAttribute("aria-expanded", String(!expanded));
    root.querySelector("dialog.source-dialog")?.addEventListener("close", () => {
      opener.setAttribute("aria-expanded", String(expanded));
    });
  };
  root.addEventListener("click", onClick);
  return () => root.removeEventListener("click", onClick);
}

/** Softer touch for the feedback-survey link the source shows on every page. */
function wireFeedback(root: ShadowRoot) {
  const onClick = (event: Event) => {
    const link = event.target instanceof Element ? event.target.closest("a.feedback-survey-link") : null;
    if (!link) return;
    event.preventDefault();
    sourceDialog(
      root,
      "Give us feedback",
      '<p>This review copy is a static capture of a public page, so the survey itself belongs to the official site.</p>' +
        '<p class="source-dialog-note">You can open the official page to share feedback with Wells Fargo.</p>' +
        `<p><a class="wf-button wf-button-red" href="${sourceUrlFor("/help/contact-us")}" target="_blank" rel="noreferrer">Contact Wells Fargo</a></p>`,
    );
  };
  root.addEventListener("click", onClick);
  return () => root.removeEventListener("click", onClick);
}

/** Collapsible contact bar sections (`aria-expanded` toggles). */
function wireCollapsibles(root: ShadowRoot) {
  const onClick = (event: Event) => {
    const header = event.target instanceof Element
      ? event.target.closest("a.contact-bar-collapsible, .contact-bar-list-header, [aria-expanded][role='button']")
      : null;
    if (!header) return;
    if (header.closest('[role="tablist"]')) return;
    if ((header.getAttribute("href") || "#") !== "#") return;
    event.preventDefault();
    const expanded = header.getAttribute("aria-expanded") === "true";
    header.setAttribute("aria-expanded", String(!expanded));
    const holder = header.parentElement;
    const content = holder?.querySelector(".contact-bar-content, .contact-bar-call-content, .contact-bar-location-content") as HTMLElement | null;
    if (content) {
      content.classList.toggle("contact-bar-content-hidden", expanded);
      content.setAttribute("aria-hidden", String(expanded));
    }
    header.classList.toggle("is-expanded", !expanded);
    if (content) content.style.display = expanded ? "none" : "";
  };
  root.addEventListener("click", onClick);
  return () => root.removeEventListener("click", onClick);
}

/** Image and rate carousels (`carousel-dot`, `left-arrow`, `right-arrow`). */
function wireCarousels(root: ShadowRoot) {
  const state = new Map<Element, number>();
  const onClick = (event: Event) => {
    const control = event.target instanceof Element
      ? event.target.closest("a.carousel-dot, a.left-arrow, a.right-arrow")
      : null;
    if (!control) return;
    const wrapper = control.closest(".carousel-navigation-wrapper, .carouselNavHolder, .ps-carousel, [data-cards-7m]")
      ?? control.parentElement;
    if (!wrapper) return;
    const dots = Array.from(wrapper.querySelectorAll("a.carousel-dot"));
    if (!dots.length) return;
    event.preventDefault();
    const current = state.get(wrapper) ?? Math.max(0, dots.findIndex((dot) => dot.classList.contains("active")));
    let next = current;
    if (control.classList.contains("left-arrow")) next = Math.max(0, current - 1);
    else if (control.classList.contains("right-arrow")) next = Math.min(dots.length - 1, current + 1);
    else next = Math.max(0, dots.indexOf(control));
    state.set(wrapper, next);
    dots.forEach((dot, index) => {
      dot.classList.toggle("active", index === next);
      dot.setAttribute("aria-label", `${index === next ? "Selected" : "View"} carousel ${index + 1} of ${dots.length}`);
    });
    const left = wrapper.querySelector("a.left-arrow");
    const right = wrapper.querySelector("a.right-arrow");
    left?.classList.toggle("active", next > 0);
    left?.setAttribute("aria-label", next > 0 ? "View previous carousel" : "Disabled view previous carousel");
    right?.classList.toggle("active", next < dots.length - 1);
    right?.setAttribute("aria-label", next < dots.length - 1 ? "View next carousel" : "Disabled view next carousel");
    // Slide the panels that the dots control, when the capture includes them.
    const slides = Array.from(wrapper.querySelectorAll("[data-carousel-slide], .carousel-slide"));
    slides.forEach((slide, index) => {
      (slide as HTMLElement).style.display = index === next ? "" : "none";
    });
    wrapper.dispatchEvent(new CustomEvent("carouselchange", { detail: { index: next } }));
  };
  root.addEventListener("click", onClick);
  return () => root.removeEventListener("click", onClick);
}

export default function PublicPage({ onLeave }: { onLeave: (url: string) => void }) {
  const { path, query, navigate } = useRouter();
  const normalized = path.replace(/\/+$/, "") || "/";
  // The homepage is captured once under `/home`; `/` is the same page, so use
  // that catalog key for snapshot lookup. `normalized` stays `/` for
  // `officialSource`, navigation, and in-page hashes.
  const catalogKey = normalized === "/" ? "/home" : normalized;
  const queryKey = normalized === "/search" ? query.q || "" : "";
  const isSearch = normalized === "/search";
  const hasSnapshot = !isSearch && Boolean(catalogData[catalogKey] || aliasFor(catalogKey));
  const [fallback, setFallback] = useState<{ from: string; to: string } | null>(null);
  /** Renders the page that *is* captured when a link points somewhere it isn't. */
  const servedNormalized = hasSnapshot ? catalogKey : (aliasFor(normalized)?.route ?? normalized);
  // The note (and the highlighted section entry) only describes a destination
  // the reader has not actually been given.
  const missing = fallback && fallback.from === servedNormalized ? null : fallback;
  const [record, setRecord] = useState<PublicPageRecord | undefined>(undefined);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const source = record?.source || officialSource(normalized);

  useEffect(() => {
    let active = true;
    setRecord(undefined);
    setError("");
    if (hasSnapshot) {
      loadCachedPage(servedNormalized)
        .then((page) => { if (active) setRecord(page); })
        .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Page unavailable."); });
      return () => { active = false; };
    }
    if (location.protocol === "file:") {
      // Live search needs the demo server; a static export offers the official link.
      setError("Live search results are only available when running the demo server.");
      return;
    }
    fetch(`/api/public-page?path=${encodeURIComponent(normalized)}${queryKey ? `&q=${encodeURIComponent(queryKey)}` : ""}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Public page unavailable.");
        return body as PublicPageRecord;
      })
      .then((page) => { if (active) setRecord(page); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Page unavailable."); });
    return () => { active = false; };
  }, [normalized, servedNormalized, attempt, queryKey, hasSnapshot]);

  const inPageHash = typeof window !== "undefined" && window.location.hash.startsWith("#") && !window.location.hash.startsWith("#/") ? window.location.hash.slice(1) : "";

  useEffect(() => {
    const element = host.current;
    if (!element || !record) return;
    let active = true;
    const root = element.shadowRoot || element.attachShadow({ mode: "open" });
    root.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = `
      :host{display:block;isolation:isolate;color:#141414;background:#fff;font-family:'Wells Fargo Sans',Arial,sans-serif;font-size:17px;line-height:1.294;}
      .public-source-page{display:block;min-height:240px;box-sizing:border-box;}
      .public-source-page *{box-sizing:border-box;}
      .public-source-page img{max-width:100%;}
      .public-source-page .ps-body-wrapper{margin-inline:auto;}
      .footnote-dialog{position:fixed;inset:0;margin:auto;max-width:560px;width:calc(100vw - 32px);max-height:calc(100dvh - 32px);overflow:auto;padding:28px 28px 24px;border:0;border-radius:10px;background:#fff;color:#141414;font:inherit;box-shadow:0 8px 32px rgb(0 0 0 / 28%);}
      .footnote-dialog::backdrop{background:rgb(0 0 0 / 45%);}
      .footnote-dialog-close{position:absolute;top:12px;right:12px;border:0;background:none;font-size:22px;line-height:1;cursor:pointer;color:#3b3331;padding:4px 8px;}
      .footnote-dialog .ps-footnote-text{margin:0;font-size:14px;}
      .source-dialog-title{margin:0 28px 12px 0;font-size:20px;font-weight:400;}
      .source-dialog-body{font-size:15px;line-height:1.5;}
      .source-dialog-body p{margin:0 0 12px;}
      .source-dialog-note{color:#787070;font-size:13px;}
      .source-dialog-body ul{list-style:none;padding:0;margin:0;display:grid;gap:8px;}
      .source-dialog-body .wf-button{display:inline-block;}
      .source-footnote-highlight{outline:2px solid #d71e28;outline-offset:4px;transition:outline-color .3s;}
      .contact-bar-collapsible.is-expanded .collapsible-icon-collapse{transform:rotate(180deg);}
      .wf-section-index{max-width:1200px;margin:56px auto 72px;padding:32px clamp(20px,5vw,48px) 40px;border-top:1px solid #d6d6d6;}
      .wf-section-index-title{margin:0 0 8px;font-size:24px;font-weight:400;}
      .wf-section-index-intro{margin:0 0 20px;color:#787070;font-size:15px;}
      .wf-section-index-list{list-style:none;margin:0;padding:0;display:grid;gap:4px 32px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));}
      .wf-section-index-list a{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;padding:9px 0;color:#141414;text-decoration:none;border-bottom:1px solid #ece8e5;font-size:15px;}
      .wf-section-index-list a:hover,.wf-section-index-list a:focus-visible{color:#d71e28;text-decoration:underline;}
      .wf-section-link-note{color:#9a918b;font-size:12px;}
      ${globalSourceCss}
    `;
    root.appendChild(style);
    for (const url of record.styles) {
      if (url.includes("ps-global")) continue;
      if (styleData[url]) {
        loadSourceStyle(url).then((css) => {
          if (!active) return;
          const extra = document.createElement("style");
          extra.textContent = css;
          root.appendChild(extra);
          keepCompatLast();
        }).catch(() => {});
        continue;
      }
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = url;
      root.appendChild(link);
    }
    // A small compatibility layer, applied after the page's own stylesheet and
    // kept last when that sheet finishes loading. It only restates what the
    // source sheet already says, plus one gap: the source hides its sign-on card
    // below 1080px because its own scripts swap in a different mobile flow, and
    // this preview has no scripts, so without this the card -- the login -- is
    // simply not drawn in a narrow window.
    const compat = document.createElement("style");
    compat.setAttribute("data-wf-compat", "");
    compat.textContent = `
      .signon-container{background:#fff;border-radius:10px;color:#141414;}
      .signon-container h2{color:#141414;}
      .signon-container .sign-top{background-color:#fff;}
      .signon-container .signon-bottom{background-color:#f4f0ed;}
      .signon-container .form-field input{color:#141414;background-color:#fff;}
      .wf-signon-note{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important;}
      .wf-signon-note.is-visible{position:static!important;width:auto!important;height:auto!important;padding:0!important;margin:8px 0 0!important;overflow:visible!important;clip:auto!important;white-space:normal!important;border:0!important;font-size:11px!important;line-height:1.35!important;color:#787070!important;}
      /* A native submit button ignores background-color in engines that keep
         -webkit-appearance:button, which paints it white. The source's Sign On is
         a solid red pill, so drop the native appearance. */
      .signon-container .ps-btn-primary{-webkit-appearance:none;appearance:none;background-color:#d71e28;color:#fff;text-decoration:none;}
      @media screen and (max-width:1079px){
        .signon-container{display:block!important;position:static;width:auto;height:auto;margin:16px;box-sizing:border-box;}
        .signon-container .form-field,.signon-container .form-field input{display:block;width:100%;}
        .signon-container .sign-top,.signon-container .signon-bottom{padding:16px;}
      }
    `;
    root.appendChild(compat);
    const keepCompatLast = () => root.appendChild(compat);

    const wrapper = document.createElement("div");
    wrapper.className = "public-source-page ps-body-container";
    // Source pages that came from wellsfargojobs.com draw their inline icons
    // from a sprite sheet on the public site.
    const careersHost = (() => { try { return new URL(record.source).hostname; } catch { return ""; } })();
    const externalHost = careersHost && careersHost !== "www.wellsfargo.com" ? `https://${careersHost}` : "https://www.wellsfargo.com";
    wrapper.innerHTML = record.html.replace(/(xlink:href|href)="\/images\//g, `$1="${externalHost}/images/`);
    const isHomepage = normalized === "/" || normalized === "/home" || record.source === "https://www.wellsfargo.com/";
    if (isHomepage) {
      // The exact promotional artwork is already bundled with this preview.
      // Use its responsive local copies so the hero also works offline.
      const heroImage = wrapper.querySelector<HTMLImageElement>(".marquee-container .marquee-img img");
      if (heroImage) {
        heroImage.srcset = `${checkingMobile} 570w, ${checkingTablet} 768w, ${checkingDesktop} 1080w`;
        heroImage.sizes = "(min-width: 1400px) min(1400px, 100vw), 100vw";
        heroImage.src = checkingDesktop;
      }
      // The live page greets visitors by local time; keep the captured source
      // text as a fallback and mirror that small piece of source behaviour.
      const greeting = wrapper.querySelector<HTMLElement>("#sign-on-header");
      if (greeting) {
        const hour = new Date().getHours();
        greeting.textContent = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
      }
    }
    root.appendChild(wrapper);

    const unwires = [
      wireTabs(root),
      wireFootnotes(root),
      wireFootnoteRefs(root),
      wireFaqAnchors(root),
      wireLegacyAccordions(root),
      wireTooltips(root),
      wireFootnoteBack(root),
      wireBalloonHelp(root, record.source),
      wirePageUtilities(root),
      wireFeedback(root),
      wireCollapsibles(root),
      wireCarousels(root),
      wireSignon(root, "https://connect.secure.wellsfargo.com/auth/login/present?origin=cob&LOB=CONS"),
    ];
    if (normalized === "/search") {
      unwires.push(wireSearchFilters(root, (visible, total) => {
        const heading = Array.from(root.querySelectorAll("h1, h2")).find((h) => /search results? for/i.test(h.textContent || ""));
        if (heading) heading.textContent = (heading.textContent || "").replace(/^\d+/, String(visible || total));
      }));
    }

    // The capture is rendered inside a shadow root, so the app's own
    // "Skip to main content" link (#main-content) cannot reach it by itself.
    // Pages whose landmark has no id of its own get the app's id, and the few
    // captures that ship no landmark at all (app-shell templates) get one on
    // the container that holds the page heading, without touching the markup
    // saved on disk and without wrapping the page's own header or footer.
    const landmark = root.querySelector<HTMLElement>("main, [role='main'], [data-wf-main]");
    if (landmark) {
      if (landmark.hasAttribute("data-wf-main")) landmark.setAttribute("role", "main");
      if (!landmark.id) landmark.id = "main-content";
    } else {
      const heading = root.querySelector<HTMLElement>("h1");
      let holder = heading?.parentElement ?? null;
      for (;;) {
        const parent = holder?.parentElement ?? null;
        if (!parent || parent.querySelector("header, footer")) break;
        holder = parent;
      }
      if (holder) {
        holder.setAttribute("role", "main");
        if (!holder.id) holder.id = "main-content";
      }
    }

    const onClick = (event: Event) => {
      const origin = event.target instanceof Element ? event.target : null;
      const anchor = origin?.closest("a");
      if (!anchor) return;
      // "More in this section" entries are plain links to the official site.
      if (anchor.closest("[data-link-index]")) return;
      event.stopPropagation();
      const href = anchor.getAttribute("href") || "";
      if (href.startsWith("#")) {
        // Footnote links open a dialog; wireFootnotes handles those.
        const footnoteId = href.slice(1);
        const footnoteTarget = footnoteId ? root.getElementById(footnoteId) : null;
        if (footnoteTarget?.classList.contains("ps-footnote-text")) return;
        // In-page anchors, and the `href="#"` controls handled by the widgets
        // above, keep their own behaviour.
        if (anchor.matches('[data-fn], [data-footnote-id], .fn-ref, [type="balloonhelp"], [data-content-id], .PopupOpener, .printLink, .feedback-survey-link, .contact-bar-collapsible, .fn-target, .fns, .carousel-dot, .left-arrow, .right-arrow, .tooltip-close-icon')) return;
        if (anchor.closest('.c52[role="region"], .c52.hide')) return;
        event.preventDefault();
        const rawId = href.slice(1);
        // Some captured headings carry a doubled hash (`##section`); the real
        // element is still addressable by its own id.
        const candidates = [rawId, rawId.replace(/^#+/, ""), decodeURIComponent(rawId.replace(/^#+/, ""))];
        const target = candidates.map((id) => (id ? root.getElementById(id) : null)).find(Boolean);
        if (target) {
          navigate(`${normalized}${window.location.search}${href.replace(/^##/, "#")}`);
          target.scrollIntoView();
        } else if (rawId) {
          // A control whose widget data was not captured (galleries that load
          // frames, "load more" buttons): keep the reader oriented and offer
          // the official page rather than swallowing the click.
          const index = root.querySelector("[data-link-index]") as HTMLElement | null;
          const label = (anchor.textContent || "").replace(/\s+/g, " ").trim();
          if (index && label) index.scrollIntoView({ behavior: "smooth", block: "start" });
          else sourceDialog(
            root,
            label || "This control",
            `<p>This page loads more content from Wells Fargo's own service, which is not part of the saved page.</p>` +
              `<p><a class="wf-button wf-button-red" href="${record.source}" target="_blank" rel="noreferrer">Open the official page</a></p>`,
          );
        } else {
          const exit = anchor.closest("[data-exit], .ps-exit-disclaimer, .ps-exit-modal")?.querySelector<HTMLAnchorElement>("a[href^='http']");
          if (exit?.href) onLeave(exit.href);
        }
        return;
      }
      if (/^(mailto:|tel:|javascript:)/i.test(href)) return;
      const destination = resolveHref(href, record.source, hasCapturedPage, aliasFor, officialFor);
      if (destination.kind === "internal") {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      if (destination.kind === "external" || destination.kind === "document") {
        onLeave(destination.url || href);
        return;
      }
      const route = destination.route as string;
      if (destination.kind === "page" && destination.fallback) {
        const unsaved = (linkIndex as Record<string, IndexEntry>)[route];
        // Destinations that have no equivalent captured page at all (no shared
        // section) open their real public URL instead of unrelated content.
        if (!hasCapturedPage(route) && (!aliasFor(route) || unsaved?.official)) {
          const requested = new URL(route, record.source).href;
          onLeave(requested);
          return;
        }
      }
      // A destination that is not captured opens the parent page, which lists
      // it under "More in this section"; note that so no reader is misled.
      setFallback(destination.fallback && route !== servedNormalized ? { from: route, to: servedNormalized } : null);
      navigate(`${route}${destination.search || ""}${destination.hash || ""}`);
    };
    const onToggle = (event: Event) => {
      if (event.target instanceof HTMLDetailsElement) {
        event.target.querySelector("summary")?.setAttribute("aria-expanded", String(event.target.open));
      }
    };
    // The header's skip link targets the app document, but the page content
    // lives in this shadow root; forward the focus to the landmark instead.
    const appSkip = document.querySelector<HTMLAnchorElement>("a.skip-link[href='#main-content']");
    const onAppSkip = (event: Event) => {
      const target = landmark;
      if (!target) return;
      event.preventDefault();
      target.setAttribute("tabindex", target.getAttribute("tabindex") || "-1");
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "start" });
    };
    appSkip?.addEventListener("click", onAppSkip);
    const onSubmit = (event: Event) => {
      if (normalized !== "/search") return;
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (!form) return;
      event.preventDefault();
      const value = new FormData(form).get("q");
      if (typeof value === "string" && value.trim()) navigate(`/search?q=${encodeURIComponent(value.trim())}`);
    };
    root.addEventListener("click", onClick);
    root.addEventListener("toggle", onToggle, true);
    root.addEventListener("submit", onSubmit);
    document.title = `${record.title} | Public page preview`;
    if (inPageHash) requestAnimationFrame(() => root.getElementById(inPageHash)?.scrollIntoView());
    // A destination that is not captured lands on its own entry in the page's
    // section list, so the reader sees exactly where the link pointed.
    if (missing?.from) {
      const anchorId = `wf-ref-${missing.from.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase()}`;
      requestAnimationFrame(() => {
        const entry = root.getElementById(anchorId);
        if (entry) {
          entry.scrollIntoView({ behavior: "smooth", block: "center" });
          entry.classList.add("is-highlighted");
          window.setTimeout(() => entry.classList.remove("is-highlighted"), 2600);
        }
      });
    }
    return () => {
      active = false;
      root.removeEventListener("click", onClick);
      root.removeEventListener("toggle", onToggle, true);
      root.removeEventListener("submit", onSubmit);
      appSkip?.removeEventListener("click", onAppSkip);
      unwires.forEach((unwire) => unwire());
    };
  }, [record, normalized, navigate, onLeave, inPageHash, missing?.from]);

  // Pages that only exist on the official site (a resource centre, a form, a
  // social share target) hand the reader over instead of failing.
  const officialOnly = (linkIndex as Record<string, IndexEntry>)[normalized]?.official;
  if (officialOnly && !hasSnapshot && !record) {
    return (
      <main className="public-page-error" id="main-content">
        <h1>This page lives on wellsfargo.com</h1>
        <p>
          The saved preview does not include this page. It is part of the same public site, so the
          link below opens it in a new tab.
        </p>
        <div>
          <a className="wf-button wf-button-red" href={officialOnly} target="_blank" rel="noreferrer">
            Open wellsfargo.com{normalized}
            <ExternalLink size={15} />
          </a>
          <a className="wf-button" href="/help/contact-us">
            Customer service
          </a>
          <a className="wf-button" href="/home">
            Back to the home page
          </a>
        </div>
      </main>
    );
  }

  if (error && !record) {
    return <main className="public-page-error" id="main-content">
      <h1>Public page unavailable</h1>
      <p>{error}</p>
      <div><button className="wf-button" onClick={() => setAttempt(attempt + 1)}><RotateCw size={16}/>Retry</button>
      <a className="wf-button wf-button-red" href={source} target="_blank" rel="noreferrer">Open official page<ExternalLink size={15}/></a></div>
    </main>;
  }
  return <>
    {!record && <div className="public-page-loading" role="status">Loading the original public page…</div>}
    {missing && record && (
      <p className="public-page-cache-note" role="status">
        That page is part of the saved section list on this page; its full text lives on the official site.{" "}
        <a href={sourceUrlFor(missing.from)} target="_blank" rel="noreferrer">Open {missing.from.replace(/^\//, "")} on wellsfargo.com</a>
      </p>
    )}
    <div className="public-page-host" ref={host} data-source={source} />
    {error && <p className="public-page-cache-note" role="status">Showing the saved public page. <a href={source} target="_blank" rel="noreferrer">Check the live version</a></p>}
  </>;
}
