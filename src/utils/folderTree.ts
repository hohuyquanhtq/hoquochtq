import { Exam, Folder } from '../types';

export interface FolderTreeNode {
  folder: Folder;
  children: FolderTreeNode[];
  directExamCount: number;
  recursiveExamCount: number;
}

export type SortField = 'name' | 'createdAt' | 'updatedAt';
export type SortDirection = 'asc' | 'desc';

export function normalizeParentId(parentId?: string | null): string | null {
  if (!parentId || typeof parentId !== 'string') return null;
  const trimmed = parentId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getDescendantFolderIds(folderId: string, folders: Folder[]): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  folders.forEach((f) => {
    const pId = normalizeParentId(f.parentId);
    if (pId) {
      const arr = childrenByParent.get(pId) || [];
      arr.push(f.id);
      childrenByParent.set(pId, arr);
    }
  });

  const visited = new Set<string>([folderId]);
  const queue: string[] = [folderId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = childrenByParent.get(current) || [];
    for (const childId of children) {
      if (!visited.has(childId)) {
        visited.add(childId);
        queue.push(childId);
      }
    }
  }
  return visited;
}

export function canMoveFolder(
  folderId: string,
  targetParentId: string | null,
  folders: Folder[]
): boolean {
  const cleanTarget = normalizeParentId(targetParentId);
  if (!cleanTarget) return true;
  if (cleanTarget === folderId) return false;
  const descendants = getDescendantFolderIds(folderId, folders);
  return !descendants.has(cleanTarget);
}

export function getFolderAncestors(folderId: string | null, folders: Folder[]): Folder[] {
  if (!folderId) return [];
  const byId = new Map(folders.map((f) => [f.id, f]));
  const chain: Folder[] = [];
  const seen = new Set<string>();
  let current: Folder | undefined = byId.get(folderId);

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    const pId = normalizeParentId(current.parentId);
    current = pId ? byId.get(pId) : undefined;
  }

  return chain;
}

export function getFolderPathLabel(folderId: string | null | undefined, folders: Folder[]): string {
  if (!folderId) return 'Đề thi';
  const ancestors = getFolderAncestors(folderId, folders);
  if (ancestors.length === 0) return 'Đề thi';
  return ['Đề thi', ...ancestors.map((f) => f.name)].join(' / ');
}

export function buildFolderTree(folders: Folder[], exams: Exam[]): FolderTreeNode[] {
  const folderIds = new Set(folders.map((f) => f.id));
  const directExamCountMap = new Map<string, number>();

  exams.forEach((ex) => {
    const fId = ex.folderId && folderIds.has(ex.folderId) ? ex.folderId : null;
    if (fId) {
      directExamCountMap.set(fId, (directExamCountMap.get(fId) || 0) + 1);
    }
  });

  const childrenByParent = new Map<string | null, Folder[]>();
  folders.forEach((f) => {
    const rawParent = normalizeParentId(f.parentId);
    const effectiveParent =
      rawParent && rawParent !== f.id && folderIds.has(rawParent) ? rawParent : null;
    const list = childrenByParent.get(effectiveParent) || [];
    list.push(f);
    childrenByParent.set(effectiveParent, list);
  });

  const buildNode = (folder: Folder, ancestry: Set<string>): FolderTreeNode => {
    const nextAncestry = new Set(ancestry);
    nextAncestry.add(folder.id);
    const rawChildren = (childrenByParent.get(folder.id) || [])
      .filter((c) => !nextAncestry.has(c.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));

    const children = rawChildren.map((child) => buildNode(child, nextAncestry));
    const directExamCount = directExamCountMap.get(folder.id) || 0;
    const recursiveExamCount =
      directExamCount + children.reduce((sum, c) => sum + c.recursiveExamCount, 0);

    return {
      folder,
      children,
      directExamCount,
      recursiveExamCount,
    };
  };

  const roots = (childrenByParent.get(null) || []).sort((a, b) =>
    a.name.localeCompare(b.name, 'vi')
  );
  return roots.map((root) => buildNode(root, new Set()));
}

export interface FlatFolderOption {
  folder: Folder;
  depth: number;
  pathLabel: string;
}

export function flattenFolderTree(
  folders: Folder[],
  exams: Exam[] = []
): FlatFolderOption[] {
  const tree = buildFolderTree(folders, exams);
  const result: FlatFolderOption[] = [];

  const visit = (nodes: FolderTreeNode[], depth: number, parentNames: string[]) => {
    for (const node of nodes) {
      const trail = [...parentNames, node.folder.name];
      result.push({
        folder: node.folder,
        depth,
        pathLabel: trail.join(' / '),
      });
      visit(node.children, depth + 1, trail);
    }
  };

  visit(tree, 0, []);
  return result;
}

function getTimestampValue(iso?: string): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

export function sortFolders(
  list: Folder[],
  sortBy: SortField,
  direction: SortDirection = sortBy === 'name' ? 'asc' : 'desc'
): Folder[] {
  const mult = direction === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    if (sortBy === 'name') {
      return a.name.localeCompare(b.name, 'vi') * mult;
    }
    if (sortBy === 'createdAt') {
      return (getTimestampValue(a.createdAt) - getTimestampValue(b.createdAt)) * mult;
    }
    return (
      (getTimestampValue(a.updatedAt || a.createdAt) -
        getTimestampValue(b.updatedAt || b.createdAt)) *
      mult
    );
  });
}

export function sortExams(
  list: Exam[],
  sortBy: SortField,
  direction: SortDirection = sortBy === 'name' ? 'asc' : 'desc'
): Exam[] {
  const mult = direction === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    if (sortBy === 'name') {
      return a.title.localeCompare(b.title, 'vi') * mult;
    }
    if (sortBy === 'createdAt') {
      return (getTimestampValue(a.createdAt) - getTimestampValue(b.createdAt)) * mult;
    }
    return (
      (getTimestampValue(a.updatedAt || a.createdAt) -
        getTimestampValue(b.updatedAt || b.createdAt)) *
      mult
    );
  });
}
