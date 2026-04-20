import { SurveyDetailView } from "../../../components/survey-detail-view";

export default async function SurveyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SurveyDetailView surveyId={id} />;
}
