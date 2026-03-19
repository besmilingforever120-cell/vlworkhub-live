import dynamicImport from "next/dynamic";

const DocumentDetailView = dynamicImport(
  () => import("../../../components/document-detail-view").then((mod) => mod.DocumentDetailView),
  {
    ssr: false,
    loading: () => <div className="legacy-empty">Loading document...</div>
  }
);

export const dynamicParams = true;
export const dynamic = "force-dynamic";

export default function DocumentDetailPage({ params }: { params: { id: string } }) {
  return <DocumentDetailView documentId={params.id} />;
}
