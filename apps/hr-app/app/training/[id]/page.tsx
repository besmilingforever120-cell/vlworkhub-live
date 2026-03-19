import { TrainingDetailView } from "../../../components/training-detail-view";

export default function TrainingDetailPage({ params }: { params: { id: string } }) {
  return <TrainingDetailView trainingId={params.id} />;
}
