import dynamic from "next/dynamic";

const TripsClient = dynamic(() => import("../../components/mileage-client"), {
	ssr: false
});

export default function TripsPage() {
	return <TripsClient />;
}
