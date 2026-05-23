import type { CSSProperties } from "react";
import type { FileNode } from "../model";

type FileExplorerProps = {
  root: FileNode;
};

export function FileExplorer({ root }: FileExplorerProps) {
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
        <ul className="project-tree" aria-label="Project files">
          <TreeNode node={root} depth={0} root />
        </ul>
      </div>
    </aside>
  );
}

type TreeNodeProps = {
  node: FileNode;
  depth: number;
  root?: boolean;
};

function TreeNode({ node, depth, root = false }: TreeNodeProps) {
  const hasChildren = Boolean(node.children?.length);
  const rowClass = [
    "tree-row",
    root ? "root-node" : "",
    node.selected ? "selected" : "",
    node.active ? "active-file" : "",
  ].filter(Boolean).join(" ");

  return (
    <li>
      <button className={rowClass} type="button" style={{ "--depth": depth } as CSSProperties}>
        <span className={hasChildren ? "tree-icon chevron open" : "tree-icon file"} aria-hidden="true" />
        {root ? <span className="root-badge">{node.name}</span> : <span>{node.name}</span>}
        {node.bound ? <span className={root ? "bound-dot" : "session-link"}>◆</span> : null}
      </button>
      {hasChildren ? (
        <ul>
          {node.children!.map((child) => <TreeNode key={child.id} node={child} depth={depth + 1} />)}
        </ul>
      ) : null}
    </li>
  );
}
