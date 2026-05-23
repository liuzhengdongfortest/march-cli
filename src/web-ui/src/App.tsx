import { AppShell } from "./components/AppShell";
import { mockWebUiModel } from "./mockData";

export function App() {
  return <AppShell model={mockWebUiModel} />;
}
