"use client";

import { useEffect, useMemo, useState } from "react";
import { FileSignature, FolderUp, PenSquare, Search } from "lucide-react";
import { createResource, getApiErrorMessage, getCurrentUser, getResource, type HrRecord, updateResource } from "../lib/hr-client";
import { HrPortalHeader } from "./hr-portal-header";

export function DocumentsWorkspace() {
  const documentForm = { title: "", category: "Policy", owner_name: "", storage_path: "", due_date: "", requires_signature: "Yes", status: "Pending Signature" };
  const signatureForm = { document_id: "", signer_name: "", status: "Pending", signed_at: "", note: "" };
  const [documents, setDocuments] = useState<HrRecord[]>([]);
  const [signatures, setSignatures] = useState<HrRecord[]>([]);
  const [documentDraft, setDocumentDraft] = useState(documentForm);
  const [signatureDraft, setSignatureDraft] = useState(signatureForm);
  const [query, setQuery] = useState("");
  const [userName, setUserName] = useState("Platform Admin");
  const [error, setError] = useState("");

  async function load() {
    try {
      const [documentData, signatureData, user] = await Promise.all([
        getResource("documents"),
        getResource("document_signatures"),
        getCurrentUser()
      ]);
      setDocuments(documentData);
      setSignatures(signatureData);
      setUserName(user.fullName);
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => documents.filter((item) => [item.title, item.category, item.owner_name].some((value) => String(value ?? "").toLowerCase().includes(query.toLowerCase()))), [documents, query]);
  const signatureByDocument = useMemo(() => signatures.reduce((acc, item) => {
    const key = String(item.document_id);
    acc[key] = [...(acc[key] || []), item];
    return acc;
  }, {} as Record<string, HrRecord[]>), [signatures]);

  async function createDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const created = await createResource("documents", documentDraft);
      if (documentDraft.requires_signature === "Yes") {
        await createResource("document_signatures", {
          document_id: String(created.id),
          signer_name: documentDraft.owner_name || userName,
          status: "Pending",
          signed_at: "",
          note: "Awaiting signature capture"
        });
      }
      setDocumentDraft(documentForm);
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }

  async function captureSignature(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createResource("document_signatures", {
        ...signatureDraft,
        signed_at: signatureDraft.signed_at || new Date().toISOString(),
        status: signatureDraft.status || "Signed"
      });
      if (signatureDraft.document_id) {
        const doc = documents.find((item) => Number(item.id) === Number(signatureDraft.document_id));
        if (doc) {
          await updateResource("documents", Number(doc.id), {
            title: String(doc.title ?? ""),
            category: String(doc.category ?? ""),
            owner_name: String(doc.owner_name ?? ""),
            storage_path: String(doc.storage_path ?? ""),
            due_date: String(doc.due_date ?? ""),
            requires_signature: String(doc.requires_signature ?? "No"),
            status: "Signed"
          });
        }
      }
      setSignatureDraft(signatureForm);
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }

  return (
    <div>
      <HrPortalHeader title="Document and Signature Workflow" description="Restored document upload, assignment, and signature capture patterns from the SharePoint document center." breadcrumb="Documents" />
      {error ? <p className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}
      <section className="mb-8 grid gap-4 lg:grid-cols-[1fr_0.7fr_0.7fr]">
        <div className="relative"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search document title, category, owner" className="w-full rounded-2xl border border-white/10 bg-slate-950 px-11 py-3 text-sm text-white" /></div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-sm text-slate-400">Documents</p><p className="mt-2 text-2xl font-semibold text-white">{documents.length}</p></div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-sm text-slate-400">Signature records</p><p className="mt-2 text-2xl font-semibold text-white">{signatures.length}</p></div>
      </section>
      <section className="grid gap-8 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-8">
          <form onSubmit={createDocument} className="rounded-[2rem] border border-white/10 bg-slate-900/60 p-6">
            <div className="mb-5 flex items-center gap-3"><div className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-300"><FolderUp className="h-5 w-5" /></div><div><h2 className="text-xl font-semibold text-white">Register document upload</h2><p className="mt-1 text-sm text-slate-400">Store metadata and initialize the signature workflow.</p></div></div>
            <div className="space-y-4">{Object.entries(documentDraft).map(([key, value]) => <div key={key}><label className="mb-2 block text-sm capitalize text-slate-300">{key.replaceAll("_", " ")}</label><input value={value} onChange={(event) => setDocumentDraft((current) => ({ ...current, [key]: event.target.value }))} className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white" /></div>)}</div>
            <button className="mt-4 w-full rounded-2xl bg-cyan-400 px-4 py-3 font-medium text-slate-950">Create document workflow</button>
          </form>
          <form onSubmit={captureSignature} className="rounded-[2rem] border border-white/10 bg-slate-900/60 p-6">
            <div className="mb-5 flex items-center gap-3"><div className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-300"><PenSquare className="h-5 w-5" /></div><div><h2 className="text-xl font-semibold text-white">Capture signature</h2><p className="mt-1 text-sm text-slate-400">Record signer, timestamp, and note for the signature queue.</p></div></div>
            <div className="space-y-4">{Object.entries(signatureDraft).map(([key, value]) => <div key={key}><label className="mb-2 block text-sm capitalize text-slate-300">{key.replaceAll("_", " ")}</label><input value={value} onChange={(event) => setSignatureDraft((current) => ({ ...current, [key]: event.target.value }))} className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white" /></div>)}</div>
            <button className="mt-4 w-full rounded-2xl bg-cyan-400 px-4 py-3 font-medium text-slate-950">Record signature</button>
          </form>
        </div>
        <div className="space-y-4">
          {filtered.map((document) => (
            <article key={String(document.id)} className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
              <div className="flex items-start justify-between gap-4"><div className="flex items-center gap-3"><div className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-300"><FileSignature className="h-5 w-5" /></div><div><h2 className="text-xl font-semibold text-white">{String(document.title ?? "Document")}</h2><p className="mt-1 text-sm text-slate-400">{String(document.category ?? "Category")}</p></div></div><span className="rounded-full bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-300">{String(document.status ?? "Pending")}</span></div>
              <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-2">
                <p>Owner: {String(document.owner_name ?? "-")}</p>
                <p>Path: {String(document.storage_path ?? "-")}</p>
                <p>Due: {String(document.due_date ?? "-")}</p>
                <p>Requires signature: {String(document.requires_signature ?? "No")}</p>
              </div>
              <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Signature queue</h3>
                <div className="mt-3 space-y-3">
                  {(signatureByDocument[String(document.id)] || []).map((signature: HrRecord) => (
                    <div key={String(signature.id)} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 px-4 py-3 text-sm text-slate-300">
                      <div>
                        <p>{String(signature.signer_name ?? "Signer")}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">{String(signature.note ?? "")}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-cyan-300">{String(signature.status ?? "Pending")}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">{String(signature.signed_at ?? "Not signed")}</p>
                      </div>
                    </div>
                  ))}
                  {!(signatureByDocument[String(document.id)] || []).length ? <p className="text-sm text-slate-500">No signatures recorded for this document.</p> : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
