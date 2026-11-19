import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import favicon from "./assets/favicon.jpg";
import Header from "./components/Header";
import SiteFooter from "./components/SiteFooter";
import ExternalLinkDialog from "./components/ExternalLinkDialog";
import { RouterProvider, useRouter } from "./router/RouterContext";

// The public product and help pages are rendered from the original public source.
import HomePage from "./pages/HomePage";
import { DemoAccess } from "./pages/DemoAccess";
import BankingWorkspace from "./portal/BankingWorkspace";
import PublicPage, { hasCapturedPage, officialSource, servedRoute } from "./public/PublicPage";
import SearchPage from "./public/SearchPage";
import { normalizedPortalPath } from "./portal/model";

import "./homepage.css";
import "./public/public-page.css";

function AppRoutes({ onLeave }: { onLeave: (url: string) => void }) {
  const { path, query } = useRouter();
  const p = path.toLowerCase().replace(/\/+$/, "") || "/";

  if (/^\/portal(?:\/|$)/.test(normalizedPortalPath(p))) {
    return <BankingWorkspace onLeave={onLeave} />;
  }
  // The homepage is served from the capture of www.wellsfargo.com, like every
  // other public page. `/` and `/home` are the same page.
  if (p === "/" || p === "/home") {
    return hasCapturedPage("/home")
      ? <PublicPage key="/home" onLeave={onLeave} />
      : <HomePage onLeave={onLeave} />;
  }
  // Demo sign-on stays local (no credentials are collected).
  if (p === "/sign-on" || p === "/login") return <DemoAccess />;
  // Live search needs the demo server; a static deployment searches the saved
  // pages instead, so the search box always leads somewhere.
  if (p === "/search") return <SearchRoute query={query.q || ""} onLeave={onLeave} />;
  // Captured public pages are served from the capture, including the ones the
  // capture stored under a locator or redirect host.
  if (hasCapturedPage(p) || servedRoute(p)) return <PublicPage key={p} onLeave={onLeave} />;
  if (["/locations", "/appointments", "/atms", "/maa"].includes(p) || p.startsWith("/auth/login")) {
    return <SecureDestination path={p} />;
  }
  return <PublicPage key={p} onLeave={onLeave} />;
}

/**
 * Services that only exist on the official site (secure sign-on, appointment
 * scheduling, the branch locator) get an explicit hand-off page instead of an
 * instant redirect, so a visitor always sees where they are going and can also
 * stay inside the preview.
 */
function SearchRoute({ query, onLeave }: { query: string; onLeave: (url: string) => void }) {
  const [live, setLive] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    if (location.protocol === "file:") {
      setLive(false);
      return;
    }
    fetch(`/api/public-page?path=/search&q=${encodeURIComponent(query.slice(0, 120))}`, { method: "GET" })
      .then((response) => {
        if (active) setLive(response.ok);
      })
      .catch(() => {
        if (active) setLive(false);
      });
    return () => {
      active = false;
    };
  }, [query]);
  if (live === null) return <main className="public-page-loading" id="main-content" role="status">Loading search results…</main>;
  if (!live) return <SearchPage query={query} onLeave={onLeave} />;
  return <PublicPage key={`/search?${query}`} onLeave={onLeave} />;
}

function SecureDestination({ path }: { path: string }) {
  const source = officialSource(path);
  return (
    <main className="public-page-error" id="main-content">
      <h1>This service is on the official site</h1>
      <p>
        Branch locations, appointments, and secure sign-on run on Wells Fargo&rsquo;s own
        systems, so they are not part of this preview.
      </p>
      <div>
        <a className="wf-button wf-button-red" href={source} target="_blank" rel="noreferrer">
          Continue to wellsfargo.com<ExternalLink size={15} />
        </a>
        <a className="wf-button" href="/help/contact-us">
          Customer service
        </a>
        <a className="wf-button" href="/home">
          Back to the preview home page
        </a>
      </div>
    </main>
  );
}

function MainApp() {
  const [leaveUrl, setLeaveUrl] = useState<string | null>(null);
  const { path } = useRouter();

  const isPortal = /^\/portal(?:\/|$)/.test(normalizedPortalPath(path.toLowerCase()));
  const isStandalonePublic = path.toLowerCase().replace(/\/+$/, "") === "/search";

  return (
    <>
      <link rel="icon" type="image/jpeg" href={favicon} />
      {!isPortal && !isStandalonePublic && <Header key={path} />}
      <AppRoutes onLeave={setLeaveUrl} />
      {!isPortal && !isStandalonePublic && <SiteFooter onLeave={setLeaveUrl} />}
      {leaveUrl && <ExternalLinkDialog url={leaveUrl} onClose={() => setLeaveUrl(null)} />}
    </>
  );
}

export default function App() {
  return (
    <RouterProvider>
      <MainApp />
    </RouterProvider>
  );
}
