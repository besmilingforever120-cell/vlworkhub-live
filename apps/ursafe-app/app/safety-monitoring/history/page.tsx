import dynamic from "next/dynamic";

const ShiftHistoryClient = dynamic(() => import("../../../components/shift-history-client"), {
  ssr: false
});

export default function Page() {
  return <ShiftHistoryClient />;
}
