import { FileTree as PierreFileTree, useFileTree } from "@pierre/trees/react";
import type { FileTreeRowDecorationContext } from "@pierre/trees";
import { useMemo } from "react";
import { createProjectFileTreeInput } from "../fileTreeAdapter";
import type { FileNode } from "../model";

type FileExplorerProps = {
  root: FileNode;
};

export function FileExplorer({ root }: FileExplorerProps) {
  const treeInput = useMemo(() => createProjectFileTreeInput(root), [root]);
  const { model } = useFileTree({
    density: "compact",
    flattenEmptyDirectories: false,
    gitStatus: treeInput.gitStatus,
    icons: { set: "minimal", colored: false },
    id: "march-project-tree",
    initialExpandedPaths: treeInput.expandedPaths,
    initialSelectedPaths: treeInput.selectedPaths,
    paths: treeInput.paths,
    renderRowDecoration: (context: FileTreeRowDecorationContext) => {
      if (!treeInput.boundPaths.has(context.item.path)) {
        return null;
      }
      return { text: "◆", title: "Bound to session" };
    },
    search: true,
  });

  return (
    <aside className="panel left-panel" aria-label="Projects">
      <div className="projects-header">
        <h3>Projects</h3>
        <button className="menu-button" type="button" aria-label="Open project menu">
          <span />
          <span />
          <span />
        </button>
      </div>
      <div className="projects-body">
        <PierreFileTree className="project-tree-host" model={model} aria-label="Project files" />
      </div>
    </aside>
  );
}
