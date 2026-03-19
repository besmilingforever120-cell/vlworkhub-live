"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import SignatureCanvas from "react-signature-canvas";
import { Document, Page, pdfjs } from "react-pdf";
import { ArrowLeft, Lock, PenSquare, Shield, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { SessionUser } from "@vlworkhub/types";
import {
  getApiErrorMessage,
  getCurrentUser,
  getHrAssignments,
  getHrDocuments,
  getPlatformUsers,
  signHrDocument,
  type HrAssignment,
  type HrDocumentRecord,
  type PlatformUserRecord
} from "../lib/hr-client";
import { useHrRole } from "../lib/use-hr-role";
import { assignmentSummary, buildDocumentViewer, canOpenDocument, canSignDocument, canViewDocument, getDocumentStatus, getStatusBadgeClass } from "../lib/document-helpers";
import { formatDate, formatHrRoleLabel } from "../lib/workflow-utils";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

type Props = {
  documentId: string;
};

async function buildSignedPdf(document: HrDocumentRecord, signatureData: string, userName: string, assignedBy: string, signedAt: string, signatureId: string) {
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
  const previewHostRef = useRef<HTMLDivElement | null>(null);
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
  const [pdfError, setPdfError] = useState("");
  const [pageCount, setPageCount] = useState(0);
  const [previewWidth, setPreviewWidth] = useState(900);

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

  useEffect(() => {
    const updatePreviewWidth = () => {
      const width = previewHostRef.current?.clientWidth || 900;
      setPreviewWidth(width);
    };

    updatePreviewWidth();
    window.addEventListener("resize", updatePreviewWidth);
    return () => window.removeEventListener("resize", updatePreviewWidth);
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
  const pageWidth = Math.min(Math.max(previewWidth - 64, 320), 900);

  useEffect(() => {
    setPdfError("");
    setPageCount(0);
  }, [document?.file_url]);

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
      const signatureId = crypto.randomUUID();
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
      await load();
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
    <div className="legacy-portal w-full max-w-none px-4 lg:px-6 xl:px-8">
      <div className="legacy-header items-start gap-3 pb-2">
        <div className="w-full">
          <button type="button" className="legacy-secondary-btn" onClick={() => router.push("/documents")}><ArrowLeft className="h-4 w-4" />Back</button>
          <h1 className="legacy-header__title mt-3">{document.file_name}</h1>
          <p className="legacy-header__subtitle mt-2">Review document content, assignment details, and signature status in a full-page workspace.</p>
          <div className="legacy-role mt-3"><Shield className="h-4 w-4" />HR Role: {formatHrRoleLabel(hrRole)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
        <section className="legacy-panel xl:col-span-9">
          <div className="legacy-panel-header">
            <div>
              <h2 className="flex items-center gap-2">Preview {document.sensitive ? <span title="Private document"><Lock className="h-4 w-4 text-slate-500" /></span> : null}</h2>
              <p>{document.file_url || "No document URL available."}</p>
            </div>
          </div>
          <div className="legacy-panel-body p-4 md:p-5">
            {canOpen ? (
              document.file_url ? (
                <div ref={previewHostRef} className="h-[calc(100vh-180px)] w-full overflow-y-auto rounded-2xl border border-slate-200 bg-slate-100">
                  <div className="flex w-full justify-center bg-slate-100 py-6">
                    <div className="flex flex-col items-center gap-6">
                      <Document
                        file={document.file_url}
                        loading={<div className="legacy-empty">Loading PDF preview...</div>}
                        onLoadSuccess={({ numPages }) => {
                          setPageCount(numPages);
                          setPdfError("");
                        }}
                        onLoadError={() => {
                          setPdfError("Document preview unavailable.");
                        }}
                        error={<div className="legacy-empty">Document preview unavailable.</div>}
                      >
                        {Array.from({ length: pageCount || 1 }, (_, index) => (
                          <div key={`page-${index + 1}`} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                            <Page
                              pageNumber={index + 1}
                              width={pageWidth}
                              renderAnnotationLayer={false}
                              renderTextLayer={false}
                            />
                          </div>
                        ))}
                      </Document>
                      {pdfError ? <div className="legacy-empty">{pdfError}</div> : null}
                    </div>
                  </div>
                </div>
              ) : <div className="legacy-empty">Preview unavailable for this document.</div>
            ) : (
              <div className="legacy-empty">You can view this document in the registry, but you do not have permission to open its contents.</div>
            )}
          </div>
        </section>

        <aside className="legacy-panel self-start xl:col-span-3 xl:sticky xl:top-6">
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
              {canSign ? (
                <button type="button" className="legacy-primary-btn" onClick={() => setShowSignaturePad(true)}>
                  <PenSquare className="h-4 w-4" />Sign Document
                </button>
              ) : null}
            </div>
          </div>
        </aside>
      </div>

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


