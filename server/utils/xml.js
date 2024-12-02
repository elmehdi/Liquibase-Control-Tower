import xmlFormatter from 'xml-formatter';

const XML_CONFIG = {
  schema: 'http://www.liquibase.org/xml/ns/dbchangelog',
  xsi: 'http://www.w3.org/2001/XMLSchema-instance',
  location: 'http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-3.3.xsd',
};

export const createChangelogXML = (author, sqlFilename) => {
  const xml = `
    <databaseChangeLog
      xmlns="${XML_CONFIG.schema}"
      xmlns:xsi="${XML_CONFIG.xsi}"
      xsi:schemaLocation="${XML_CONFIG.schema}
                          ${XML_CONFIG.location}">
      <changeSet author="${author}" id="${sqlFilename}">
        <sqlFile path="sql/${sqlFilename}.sql" relativeToChangelogFile="true" splitStatements="true"/>
      </changeSet>
    </databaseChangeLog>
  `;

  return xmlFormatter(xml, { indentation: '  ' });
};

export const createCategoryMasterXML = (category, version, newFiles, existingIncludes = []) => {
  const allIncludes = [...new Set([
    ...existingIncludes,
    ...newFiles.map(file => `${category}/${file.name}.xml`)
  ])];

  const xml = `
    <databaseChangeLog
      xmlns="${XML_CONFIG.schema}"
      xmlns:xsi="${XML_CONFIG.xsi}"
      xsi:schemaLocation="${XML_CONFIG.schema}
                          ${XML_CONFIG.location}">
      ${allIncludes.map(file => 
        `  <include relativeToChangelogFile="true" file="${file}"/>`
      ).join('\n')}
    </databaseChangeLog>
  `;

  return xmlFormatter(xml, { indentation: '  ' });
};

export const createTagDatabaseXML = (author, version) => {
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

  return xmlFormatter(xml, { indentation: '  ' });
};

export const createMainChangelogXML = (existingIncludes = [], newCategoryFiles = []) => {
  const allIncludes = [...new Set([...existingIncludes, ...newCategoryFiles])];

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
      ${allIncludes.map(file => 
        `  <include relativeToChangelogFile="true" file="${file}"/>`
      ).join('\n')}
    </databaseChangeLog>
  `;

  return xmlFormatter(xml, { indentation: '  ' });
};
