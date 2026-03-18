import { DocumentDetailView } from "../../../components/document-detail-view";

export default function DocumentDetailPage({ params }: { params: { id: string } }) {
  return <DocumentDetailView documentId={params.id} />;
}