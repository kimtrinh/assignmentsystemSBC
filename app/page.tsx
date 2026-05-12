import AuthGate from "@/components/AuthGate";
import Board from "@/components/Board";

export default function Page() {
  return (
    <AuthGate>
      <Board />
    </AuthGate>
  );
}
