import { useState } from "react";
import type { WebUiModel } from "../model";
import { Composer } from "./Composer";
import { FileExplorer } from "./FileExplorer";
import { RightSidebar } from "./RightSidebar";
import { SessionTimeline } from "./SessionTimeline";

type AppShellProps = {
  model: WebUiModel;
};

export function AppShell({ model }: AppShellProps) {
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const closePanels = () => {
    setLeftOpen(false);
    setRightOpen(false);
  };

  return (
    <div className="app-shell" data-left-open={leftOpen} data-right-open={rightOpen}>
      <div className="overlay" onClick={closePanels} />
      <FileExplorer root={model.workspace} />
      <SessionTimeline timeline={model.timeline} />
      <RightSidebar sessions={model.sessions} activity={model.activity} />
      <Composer
        composer={model.composer}
        onOpenLeft={() => setLeftOpen(true)}
        onOpenRight={() => setRightOpen(true)}
      />
    </div>
  );
}
