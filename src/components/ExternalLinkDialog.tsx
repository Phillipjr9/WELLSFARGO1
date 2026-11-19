import Dialog from "./Dialog";
import { CloseIcon } from "./Icons";

export default function ExternalLinkDialog({ url, onClose }: { url: string; onClose: () => void }) {
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "wellsfargo.com";
    }
  })();
  // Documents (rate sheets, disclosures, tax forms) are stored on the official
  // site, so name the file the reader is about to open.
  const document = (() => {
    try {
      const { pathname } = new URL(url);
      const file = decodeURIComponent(pathname.split("/").pop() || "");
      if (!/\.(pdf|zip|csv|xlsx?|docx?|txt)$/i.test(file)) return null;
      return { file, type: (file.split(".").pop() || "").toUpperCase() };
    } catch {
      return null;
    }
  })();
  return (
    <Dialog label={document ? "Document on the official site" : "You are leaving this preview"} className="external-dialog" onClose={onClose}>
      <div className="flex items-start justify-between gap-4">
        <h2>{document ? `This ${document.type} opens on ${host}` : "You are leaving this preview"}</h2>
        <button autoFocus type="button" onClick={onClose} aria-label="Close dialog"><CloseIcon /></button>
      </div>
      {document ? (
        <p>
          The document <strong>{document.file}</strong> is part of the official Wells Fargo site and is
          not stored in this preview. It opens in a new tab.
        </p>
      ) : (
        <p>You are about to open <strong>{host}</strong> in a new tab.</p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <a className="wf-button wf-button-red" href={url} target="_blank" rel="noopener noreferrer" onClick={onClose}>{document ? "Open document" : "Continue"}</a>
        <button type="button" className="wf-button" onClick={onClose}>Cancel</button>
      </div>
    </Dialog>
  );
}