import dynamic from "next/dynamic";

const ActiveUsersClient = dynamic(() => import("../../components/active-users-client"), {
  ssr: false
});

export default function ActiveUsersPage() {
  return <ActiveUsersClient />;
}
