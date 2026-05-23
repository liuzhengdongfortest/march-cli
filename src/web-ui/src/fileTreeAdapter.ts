import type { GitStatusEntry } from "@pierre/trees";
import type { FileNode } from "./model";

export type ProjectFileTreeInput = {
  boundPaths: Set<string>;
  expandedPaths: string[];
  gitStatus: GitStatusEntry[];
  paths: string[];
  selectedPaths: string[];
};

export function createProjectFileTreeInput(root: FileNode): ProjectFileTreeInput {
  const input: ProjectFileTreeInput = {
    boundPaths: new Set<string>(),
    expandedPaths: [],
    gitStatus: [],
    paths: [],
    selectedPaths: [],
  };

  visitNode(root, "", input);

  return input;
}

function visitNode(node: FileNode, parentPath: string, input: ProjectFileTreeInput) {
  const path = joinPath(parentPath, node.name);

  input.paths.push(node.kind === "folder" ? `${path}/` : path);

  if (node.kind === "folder" && node.children?.length) {
    input.expandedPaths.push(path);
  }
  if (node.selected || node.active) {
    input.selectedPaths.push(path);
  }
  if (node.bound) {
    input.boundPaths.add(path);
  }
  if (node.gitStatus) {
    input.gitStatus.push({ path, status: node.gitStatus });
  }

  for (const child of node.children ?? []) {
    visitNode(child, path, input);
  }
}

function joinPath(parentPath: string, name: string) {
  return parentPath ? `${parentPath}/${name}` : name;
}
