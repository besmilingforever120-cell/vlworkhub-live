import dynamic from "next/dynamic";

const SafetyMonitoringClient = dynamic(() => import("../../components/safety-monitoring-client"), {
  ssr: false
});

export default function Page() {
  return <SafetyMonitoringClient />;
}
