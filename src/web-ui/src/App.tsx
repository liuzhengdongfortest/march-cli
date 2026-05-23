import { AppShell } from "./components/AppShell";
import { useWebRuntime } from "./runtime/useWebRuntime";

export function App() {
  const runtime = useWebRuntime();
  return <AppShell runtime={runtime} />;
}
