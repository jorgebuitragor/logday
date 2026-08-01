export interface Note {
  id: string;
  title: string;
  folder: string;    // '' = unfiled (root)
  tags: string[];
  created: string;   // YYYY-MM-DD
  updated: string;   // YYYY-MM-DD
  pinned: boolean;
  content: string;
  filePath: string;
}
