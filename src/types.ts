export interface ProjectConfig {
  author: string;
  version: string;
  categories: Array<{
    name: string;
    files: string[];
  }>;
} 