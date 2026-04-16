"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import SignatureCanvas from "react-signature-canvas";
import { ArrowLeft, Download, Lock, PenSquare, Shield, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { SessionUser } from "@vlworkhub/types";
import {
  getApiErrorMessage,
  getCurrentUser,
  getHrAssignments,
  getHrDocumentDownloadUrl,
  getHrDocuments,
  getPlatformUsers,
  signHrDocument,
  type HrAssignment,
  type HrDocumentRecord,
  type PlatformUserRecord
} from "../lib/hr-client";
import { useHrRole } from "../lib/use-hr-role";
import {
  assignmentSummary,
  buildDocumentViewer,
  canOpenDocument,
  canSignDocument,
  canViewDocument,
  getDocumentStatus,
  getStatusBadgeClass
} from "../lib/document-helpers";
import { formatDate, formatHrRoleLabel } from "../lib/workflow-utils";

type Props = {
  documentId: string;
};

type PreviewDocument = HrDocumentRecord & {
  fileUrl?: string | null;
  url?: string | null;
};

function createSignatureId() {
  const webCrypto = globalThis.crypto;
  if (webCrypto && typeof webCrypto.randomUUID === "function") {
    return webCrypto.randomUUID();
  }

  if (webCrypto && typeof webCrypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    webCrypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  const timestamp = Date.now().toString(16);
  const random = Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, "0");
  return `sig-${timestamp}-${random}`;
}


async function buildSignedPdf(
  document: HrDocumentRecord,
  signatureData: string,
  userName: string,
  assignedBy: string,
  signedAt: string,
  signatureId: string
) {
  let pdfDoc: PDFDocument;

  try {
    if (!document.file_url) throw new Error("Missing original document URL");
    const response = await fetch(document.file_url);
    const bytes = await response.arrayBuffer();
    pdfDoc = await PDFDocument.load(bytes);
  } catch {
    pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([612, 792]);
  }

  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pngImage = await pdfDoc.embedPng(signatureData);
  const scaled = pngImage.scale(0.35);

  page.drawText("Document Signature", { x: 48, y: 736, size: 24, font: bold, color: rgb(0.1, 0.17, 0.29) });
  page.drawText(`Signed by: ${userName}`, { x: 48, y: 690, size: 12, font, color: rgb(0.2, 0.24, 0.31) });
  page.drawText(`Assigned by: ${assignedBy || "-"}`, { x: 48, y: 668, size: 12, font, color: rgb(0.2, 0.24, 0.31) });
  page.drawText(`Date: ${signedAt}`, { x: 48, y: 646, size: 12, font, color: rgb(0.2, 0.24, 0.31) });
  page.drawText(`Signature ID: ${signatureId}`, { x: 48, y: 624, size: 12, font, color: rgb(0.2, 0.24, 0.31) });
  page.drawText("Signature", { x: 48, y: 578, size: 13, font: bold, color: rgb(0.1, 0.17, 0.29) });
  page.drawImage(pngImage, { x: 48, y: 430, width: scaled.width, height: scaled.height });

  return pdfDoc.saveAsBase64({ dataUri: true });
}

export function DocumentDetailView({ documentId }: Props) {
  const router = useRouter();
  const signatureRef = useRef<SignatureCanvas | null>(null);
  const { role: hrRole } = useHrRole();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<PlatformUserRecord[]>([]);
  const [assignments, setAssignments] = useState<HrAssignment[]>([]);
  const [documents, setDocuments] = useState<HrDocumentRecord[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [signatureError, setSignatureError] = useState("");
  const [previewPages, setPreviewPages] = useState<Array<{ pageNumber: number; src: string; width: number; height: number }>>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const [sessionResult, usersResult, assignmentsResult, documentsResult] = await Promise.allSettled([
      getCurrentUser(),
      getPlatformUsers(),
      getHrAssignments(),
      getHrDocuments()
    ]);

    if (sessionResult.status === "fulfilled") setUser(sessionResult.value);
    else setError(getApiErrorMessage(sessionResult.reason));

    if (usersResult.status === "fulfilled") setUsers(usersResult.value.items || []);
    else setUsers([]);

    if (assignmentsResult.status === "fulfilled") setAssignments(assignmentsResult.value.items || []);
    else setAssignments([]);

    if (documentsResult.status === "fulfilled") setDocuments((documentsResult.value.items || []) as HrDocumentRecord[]);
    else setError(getApiErrorMessage(documentsResult.reason));

    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const viewer = useMemo(() => (user ? buildDocumentViewer(user.id, hrRole, assignments) : null), [assignments, hrRole, user]);
  const document = useMemo(() => documents.find((item) => String(item.id) === documentId) || null, [documentId, documents]);
  const assignedByName = useMemo(() => {
    if (!document?.created_by) return "-";
    const match = users.find((candidate) => candidate.id === document.created_by);
    return match?.name || match?.email || "-";
  }, [document?.created_by, users]);
  const userName = user?.fullName || user?.email || "User";
  const canView = document ? canViewDocument(document, viewer, users) : false;
  const canOpen = document ? canOpenDocument(document, viewer, users) : false;
  const canSign = document ? canSignDocument(document, viewer, users) : false;
  const status = document ? getDocumentStatus(document) : "pending";
  const previewDocument = document as PreviewDocument | null;
  const documentUrl = previewDocument?.file_url || previewDocument?.fileUrl || previewDocument?.url || null;

  useEffect(() => {
    if (!documentUrl) {
      setPreviewPages([]);
      setPreviewError("");
      return;
    }

    let cancelled = false;

    const loadPreviewPages = async () => {
      try {
        setPreviewLoading(true);
        setPreviewError("");

        const pdfjs = (await import("pdfjs-dist/build/pdf.mjs" as string)) as any;
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

        const loadingTask = pdfjs.getDocument(documentUrl);
        const pdf = await loadingTask.promise;
        const renderPage = async (pageNumber: number) => {
          const page = await pdf.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const targetHeight = 1400;
          const scale = targetHeight / baseViewport.height;
          const viewport = page.getViewport({ scale });
          const canvas = window.document.createElement("canvas");
          const context = canvas.getContext("2d");

          if (!context) return null;

          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);

          await page.render({ canvasContext: context, viewport }).promise;
          return {
            pageNumber,
            src: canvas.toDataURL("image/png"),
            width: canvas.width,
            height: canvas.height
          };
        };

        const firstPage = await renderPage(1);
        if (!cancelled && firstPage) {
          setPreviewPages([firstPage]);
        }

        const renderedPages: Array<{ pageNumber: number; src: string; width: number; height: number }> = firstPage ? [firstPage] : [];

        for (let pageNumber = 2; pageNumber <= pdf.numPages; pageNumber += 1) {
          const renderedPage = await renderPage(pageNumber);
          if (!renderedPage) continue;

          renderedPages.push(renderedPage);
          if (!cancelled) {
            setPreviewPages([...renderedPages]);
          }
        }
      } catch {
        if (!cancelled) {
          setPreviewPages([]);
          setPreviewError("Document preview unavailable.");
        }
      } finally {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      }
    };

    void loadPreviewPages();

    return () => {
      cancelled = true;
    };
  }, [documentUrl]);

  async function handleConfirmSign() {
    if (!document || !user) return;
    const pad = signatureRef.current;
    if (!pad || pad.isEmpty()) {
      setSignatureError("A drawn signature is required before signing.");
      return;
    }

    try {
      setSignatureError("");
      const signatureData = pad.toDataURL();
      const signatureId = createSignatureId();
      const signedAtIso = new Date().toISOString();
      const signedPdfDataUri = await buildSignedPdf(document, signatureData, userName, assignedByName, signedAtIso, signatureId);

      await signHrDocument(Number(document.id), {
        signatureData,
        signatureId,
        signedAt: signedAtIso,
        signedBy: userName,
        assignedBy: assignedByName,
        signedFileUrl: signedPdfDataUri
      });

      setShowSignaturePad(false);
      router.push("/documents");
    } catch (signError) {
      setSignatureError(getApiErrorMessage(signError));
    }
  }

  if (loading) {
    return <div className="legacy-empty">Loading document...</div>;
  }

  if (error) {
    return <div className="hr-card" style={{ color: "#b91c1c", borderColor: "#fecaca", background: "#fff1f2" }}>{error}</div>;
  }

  if (!document || !canView) {
    return <div className="legacy-empty">Document not found or unavailable in your current HR scope.</div>;
  }

  return (
    <div className="w-full flex flex-col">
      <div className="flex items-center justify-between border-b bg-white p-4">
        <div className="flex min-w-0 items-center gap-4">
          <button type="button" className="legacy-secondary-btn" onClick={() => router.push("/documents")}>
            <ArrowLeft className="h-4 w-4" />Back
          </button>
          <div className="min-w-0">
            <h1 className="legacy-header__title truncate">{document.file_name}</h1>
            <div className="mt-2 flex items-center gap-3 text-sm text-slate-600">
              <span className="legacy-role"><Shield className="h-4 w-4" />HR Role: {formatHrRoleLabel(hrRole)}</span>
              {document.sensitive ? <span title="Private document"><Lock className="h-4 w-4 text-slate-500" /></span> : null}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {document.allow_download ? (
            <button type="button" className="legacy-secondary-btn shrink-0" onClick={() => window.open(getHrDocumentDownloadUrl(Number(document.id)), "_blank", "noopener,noreferrer")}>
              <Download className="h-4 w-4" />Download
            </button>
          ) : null}
          {canSign ? (
            <button type="button" className="legacy-primary-btn shrink-0" onClick={() => setShowSignaturePad(true)}>
              <PenSquare className="h-4 w-4" />Sign Document
            </button>
          ) : null}
        </div>
      </div>


      <div className="px-4 pb-6 pt-4 lg:px-6 xl:px-8">
        <p className="legacy-header__subtitle">Review document content, assignment details, and signature status in a full-page workspace.</p>
      </div>

      <section className="w-full px-4 lg:px-6 xl:px-8">
        {canOpen ? (
          documentUrl ? (
            <div className="w-full overflow-x-auto rounded-xl bg-slate-900 p-4">
              {previewLoading ? (
                <div className="legacy-empty">Loading document preview...</div>
              ) : previewPages.length ? (
                <div className="flex min-w-max flex-col items-center gap-8 py-2">
                  {previewPages.map((page) => (
                    <div key={page.pageNumber} className="overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-[0_12px_32px_rgba(15,23,42,0.22)]">
                      <img
                        src={page.src}
                        alt={`${document.file_name} page ${page.pageNumber}`}
                        width={page.width}
                        height={page.height}
                        style={{ display: "block", width: page.width, height: page.height, maxWidth: "none" }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="legacy-empty">
                  {previewError || "Document preview unavailable."} <a href={documentUrl} target="_blank" rel="noreferrer">Open document</a>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center p-10 text-gray-500">No preview available</div>
          )
        ) : (
          <div className="legacy-empty">You can view this document in the registry, but you do not have permission to open its contents.</div>
        )}
      </section>

      <section className="p-4 lg:px-6 xl:px-8">
          <div className="legacy-panel w-full max-w-none">
            <div className="legacy-panel-header">
              <div>
                <h2>Document Details</h2>
                <p>Assignment, signer, and due-date information for this document.</p>
              </div>
            </div>
            <div className="legacy-panel-body">
              <div className="legacy-detail-stack">
                <div className="legacy-detail-card">
                  <h4>Assignment</h4>
                  <p>Assigned to: {assignmentSummary(document)}</p>
                  <p>Assigned by: {assignedByName}</p>
                  <p>Due date: {formatDate(document.due_date)}</p>
                  <p>Status: <span className={getStatusBadgeClass(status)}>{status === "pending" ? "Pending" : status === "signed" ? "Signed" : "Archived"}</span></p>
                  <p>Signed by: {document.signed_user_names.join(", ") || "-"}</p>
                  <p>Signed date: {formatDate(document.signed_at)}</p>
                </div>
              </div>
            </div>
          </div>
        </section>


      {showSignaturePad ? (
        <div className="legacy-modal-overlay">
          <div className="legacy-modal" style={{ maxWidth: 720 }}>
            <div className="legacy-modal-header"><h2>Sign Document</h2><button type="button" className="legacy-icon-btn" onClick={() => setShowSignaturePad(false)}><X className="h-4 w-4" /></button></div>
            <div className="legacy-modal-body">
              <div className="legacy-form-grid">
                <div className="legacy-form-group legacy-form-group--full">
                  <label>Draw Signature</label>
                  <div style={{ border: "1px solid #dbe1ea", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
                    <SignatureCanvas ref={signatureRef} canvasProps={{ width: 640, height: 220, className: "signature-canvas" }} />
                  </div>
                  <div className="legacy-actions-row" style={{ marginTop: 12 }}>
                    <button type="button" className="legacy-secondary-btn" onClick={() => signatureRef.current?.clear()}>Clear Signature</button>
                  </div>
                </div>
                {signatureError ? <p className="legacy-field-error">{signatureError}</p> : null}
              </div>
            </div>
            <div className="legacy-modal-footer">
              <button type="button" className="legacy-secondary-btn" onClick={() => setShowSignaturePad(false)}>Cancel</button>
              <button type="button" className="legacy-primary-btn" onClick={() => void handleConfirmSign()}><PenSquare className="h-4 w-4" />Confirm Sign</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}







