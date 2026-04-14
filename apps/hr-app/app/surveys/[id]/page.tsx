import { SurveyDetailView } from "../../../components/survey-detail-view";

export default function SurveyDetailPage({ params }: { params: { id: string } }) {
  return <SurveyDetailView surveyId={params.id} />;
}
