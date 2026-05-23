import { useState } from "react";
import type { WebRuntimeState } from "../runtime/useWebRuntime";
import { Composer } from "./Composer";
import { FileExplorer } from "./FileExplorer";
import { RightSidebar } from "./RightSidebar";
import { SessionTimeline } from "./SessionTimeline";

export type AppShellProps = {
  runtime: WebRuntimeState;
};

export function AppShell({ runtime }: AppShellProps) {
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const { model } = runtime;
  const closePanels = () => {
    setLeftOpen(false);
    setRightOpen(false);
  };

  return (
    <div className="app-shell" data-left-open={leftOpen} data-right-open={rightOpen}>
      <div className="overlay" onClick={closePanels} />
      <FileExplorer root={model.workspace} />
      <SessionTimeline timeline={model.timeline} connected={runtime.connected} error={runtime.error} />
      <RightSidebar sessions={model.sessions} activity={model.activity} />
      <Composer
        composer={model.composer}
        running={runtime.running}
        onSubmit={runtime.submitPrompt}
        onOpenLeft={() => setLeftOpen(true)}
        onOpenRight={() => setRightOpen(true)}
      />
    </div>
  );
}
