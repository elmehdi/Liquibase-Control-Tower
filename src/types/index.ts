export interface SQLFile {
  name: string;
  xml: string;
  sql: string;
}

export interface Category {
  name: string;
  files: SQLFile[];
}

export interface ProjectConfig {
  author: string;
  version: string;
  categories: Category[];
}

export type Mode = 'build' | 'check' | 'install';

export const CATEGORIES = [
  'tables',
  'views',
  'materialized_views',
  'procedures',
  'sequences',
] as const;

export const XML_CONFIG = {
  schema: 'http://www.liquibase.org/xml/ns/dbchangelog',
  xsi: 'http://www.w3.org/2001/XMLSchema-instance',
  location: 'http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-3.3.xsd',
} as const;