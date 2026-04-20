import { TrainingDetailView } from "../../../components/training-detail-view";

export default async function TrainingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TrainingDetailView trainingId={id} />;
}
