export interface FolderNode {
  name: string;
  path: string;
  children: FolderNode[];
}

export function buildFolderTree(folders: string[]): FolderNode[] {
  const sorted = [...folders].sort();
  const root: FolderNode[] = [];
  for (const path of sorted) {
    const parts = path.split('/');
    let current = root;
    let currentPath = '';
    for (let i = 0; i < parts.length; i++) {
      currentPath = i === 0 ? parts[0] : `${currentPath}/${parts[i]}`;
      let node = current.find(n => n.path === currentPath);
      if (!node) {
        node = { name: parts[i], path: currentPath, children: [] };
        current.push(node);
      }
      current = node.children;
    }
  }
  return root;
}
