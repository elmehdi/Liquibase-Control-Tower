import format from 'xml-formatter';
import { ProjectConfig, XML_CONFIG } from '../types';

export const createChangelogXML = (
  author: string,
  sqlFilename: string,
  isMaster: boolean = false
): string => {
  const xml = `
    <databaseChangeLog
      xmlns="${XML_CONFIG.schema}"
      xmlns:xsi="${XML_CONFIG.xsi}"
      xsi:schemaLocation="${XML_CONFIG.schema}
                          ${XML_CONFIG.location}">
      ${!isMaster ? `
      <changeSet author="${author}" id="${sqlFilename}">
        <sqlFile path="sql/${sqlFilename}.sql" relativeToChangelogFile="true" splitStatements="true"/>
      </changeSet>
      ` : ''}
    </databaseChangeLog>
  `;

  return format(xml, { indentation: '  ' });
};

export const createTagDatabaseXML = (author: string, version: string): string => {
  const xml = `
    <databaseChangeLog
      xmlns="${XML_CONFIG.schema}"
      xmlns:xsi="${XML_CONFIG.xsi}"
      xsi:schemaLocation="${XML_CONFIG.schema}
                          ${XML_CONFIG.location}">
      <changeSet author="${author}" id="tag-database">
        <tagDatabase tag="${version}.0.0"/>
      </changeSet>
    </databaseChangeLog>
  `;

  return format(xml, { indentation: '  ' });
};

export const createMainChangelogXML = (config: ProjectConfig): string => {
  const includes = config.categories
    .filter(category => category.files.length > 0)
    .map(category => 
      `  <include relativeToChangelogFile="true" file="changelog-${config.version}-${category.name.toUpperCase()}.xml"/>`
    )
    .join('\n');

  const xml = `
    <databaseChangeLog
      xmlns="${XML_CONFIG.schema}"
      xmlns:xsi="${XML_CONFIG.xsi}"
      xsi:schemaLocation="${XML_CONFIG.schema}
                          ${XML_CONFIG.location}">
      
      <!-- Definition de la version -->
      <!-- -->
      <include relativeToChangelogFile="true" file="tag-database.xml"/>

      <!-- Ajouter tous les version à installer -->
      ${includes}
    </databaseChangeLog>
  `;

  return format(xml, { indentation: '  ' });
};