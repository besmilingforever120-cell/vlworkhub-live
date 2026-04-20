import { DocumentDetailView } from "../../../components/document-detail-view";

export const dynamicParams = true;
export const dynamic = "force-dynamic";

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <div className="w-full h-[calc(100vh-100px)] flex flex-col">
      <DocumentDetailView documentId={id} />
    </div>
  );
}
