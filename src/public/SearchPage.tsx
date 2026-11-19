import { useMemo, useState } from "react";
import searchIndexData from "./search-index.json";
import { resolveHref } from "./links";
import { hasCapturedPage, servedRoute } from "./PublicPage";

type Entry = {
  route: string;
  title: string;
  heading: string;
  section: string;
  headings: string[];
  excerpt: string;
};

const index = searchIndexData as unknown as Entry[];

const categories = Array.from(new Set(index.map((entry) => entry.section))).sort();

function score(entry: Entry, terms: string[]): number {
  const title = entry.title.toLowerCase();
  const heading = entry.heading.toLowerCase();
  const headings = entry.headings.join(" ").toLowerCase();
  const body = entry.excerpt.toLowerCase();
  let total = 0;
  for (const term of terms) {
    if (title.includes(term)) total += 6;
    if (heading.includes(term)) total += 4;
    if (headings.includes(term)) total += 3;
    if (body.includes(term)) total += 1;
    if (entry.route.toLowerCase().includes(term)) total += 2;
  }
  return total;
}

/**
 * Search over the saved public pages. The live site's search runs on Wells
 * Fargo's own service; this looks through the same pages the preview holds, so
 * the search box still leads somewhere useful when the demo API is unavailable
 * (a static export, for example).
 */
export default function SearchPage({
  query,
  onLeave,
}: {
  query: string;
  onLeave: (url: string) => void;
}) {
  const [selected, setSelected] = useState<string[]>(categories);
  const [filterOpen, setFilterOpen] = useState(false);
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

  const results = useMemo(() => {
    if (!terms.length) return [];
    return index
      .filter((entry) => selected.includes(entry.section))
      .map((entry) => ({ entry, value: score(entry, terms) }))
      .filter((result) => result.value > 0)
      .sort((a, b) => b.value - a.value || a.entry.route.localeCompare(b.entry.route))
      .slice(0, 40)
      .map((result) => result.entry);
  }, [terms.join(" "), selected.join("|")]);

  const toggle = (category: string) =>
    setSelected((current) =>
      current.includes(category) ? current.filter((item) => item !== category) : [...current, category],
    );

  return (
    <main className="wf-search" id="main-content">
      <div className="wf-search-inner">
        <h1>Search results for &ldquo;{query || "Wells Fargo"}&rdquo;</h1>
        <p className="wf-search-count" role="status">
          {terms.length ? `${results.length} result${results.length === 1 ? "" : "s"}` : "Enter a search term"} in the saved pages
        </p>

        <div className="wf-search-layout">
          <aside className="wf-search-filters" aria-label="Filter results">
            <button
              type="button"
              className="wf-search-filter-toggle"
              aria-expanded={filterOpen}
              onClick={() => setFilterOpen(!filterOpen)}
            >
              Filter by category
            </button>
            <ul className={filterOpen ? "is-open" : ""}>
              {categories.map((category) => {
                const checked = selected.includes(category);
                return (
                  <li key={category}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() => toggle(category)}
                    >
                      <span className={`wf-search-box${checked ? " is-checked" : ""}`} aria-hidden="true" />
                      {category}
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <section className="wf-search-results" aria-label="Results">
            {results.map((entry) => {
              const destination = resolveHref(entry.route, window.location.origin, hasCapturedPage);
              const target = servedRoute(entry.route) || entry.route;
              const unsaved = destination.kind === "external" || destination.kind === "document";
              return (
                <article key={entry.route} className="wf-search-result">
                  <p className="wf-search-result-section">{entry.section}</p>
                  <h2>
                    <a
                      href={unsaved ? destination.url || entry.route : target}
                      target={unsaved ? "_blank" : undefined}
                      rel={unsaved ? "noreferrer" : undefined}
                      onClick={(event) => {
                        if (unsaved) {
                          event.preventDefault();
                          onLeave(destination.url || entry.route);
                        }
                      }}
                    >
                      {entry.heading || entry.title}
                    </a>
                  </h2>
                  <p>{entry.excerpt}</p>
                  <p className="wf-search-result-path">wellsfargo.com{entry.route}</p>
                </article>
              );
            })}
            {terms.length > 0 && results.length === 0 && (
              <p className="wf-search-empty">
                No saved page matches that search. Try a product name such as <em>checking</em>,{" "}
                <em>mortgage</em>, or <em>credit cards</em>.
              </p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

