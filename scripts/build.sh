#!/bin/bash

set -euo pipefail

# Color codes
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m' # No Color

# Constants
readonly CATEGORIES=("tables" "views" "materialized_views" "procedures" "sequences")
readonly XML_SCHEMA="http://www.liquibase.org/xml/ns/dbchangelog"
readonly XML_XSI="http://www.w3.org/2001/XMLSchema-instance"
readonly XML_LOCATION="http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-3.3.xsd"

# Add new constant for param option
readonly PARAM_CATEGORY="data"

# Enhanced logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $*" >&2; }
log_error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $*" >&2; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $*" >&2; }

print_header() {
    echo -e "\n${CYAN}=== $* ===${NC}\n"
}

print_separator() {
    echo -e "\n${CYAN}----------------------------------------${NC}"
}

# Validation functions
validate_input() {
    local input=$1
    local field_name=$2
    
    if [[ -z "$input" ]]; then
        log_error "$field_name cannot be empty"
        return 1
    fi
    
    if [[ "$input" =~ [^a-zA-Z0-9_-] ]]; then
        log_error "$field_name contains invalid characters. Use only letters, numbers, underscores, and hyphens"
        return 1
    fi
    
    return 0
}

create_xml_file() {
    local file_path=$1
    local author=$2
    local sql_filename=$3
    local is_master=${4:-false}
    
    {
        echo '<databaseChangeLog'
        echo "  xmlns=\"$XML_SCHEMA\""
        echo "  xmlns:xsi=\"$XML_XSI\""
        echo "  xsi:schemaLocation=\"$XML_SCHEMA"
        echo "                      $XML_LOCATION\">"
        
        if [ "$is_master" = false ]; then
            echo "  <changeSet author=\"$author\" id=\"$sql_filename\">"
            echo "        <sqlFile path=\"sql/$sql_filename.sql\" relativeToChangelogFile=\"true\" splitStatements=\"true\"/>"
            echo "  </changeSet>"
        fi
        
        echo "</databaseChangeLog>"
    } > "$file_path"
}

create_directory_structure() {
    local category=$1
    
    if ! mkdir -p "$category/sql"; then
        log_error "Failed to create directory structure for $category"
        return 1
    fi
    return 0
}

process_sql_files() {
    local category=$1
    local author=$2
    local version=$3
    local -a sql_files=()
    local category_upper=${category^^}
    # Only create version-specific changelog for SIO2 option
    local master_changelog
    if [ "$category" != "$PARAM_CATEGORY" ]; then
        master_changelog="changelog-$version-${category_upper}.xml"
    fi
    
    print_header "SQL Files for $category_upper"
    echo -e "${CYAN}Enter SQL file names one by one${NC}"
    echo -e "${YELLOW}Press [Enter] without typing to finish${NC}\n"
    
    while true; do
        echo -e "${CYAN}SQL files added:${NC} ${#sql_files[@]}"
        read -rp $'\033[0;36m>\033[0m ' sql_file
        
        if [[ -z "$sql_file" ]]; then
            if [[ ${#sql_files[@]} -eq 0 ]]; then
                log_warning "No files were added"
            fi
            break
        fi
        
        if ! validate_input "$sql_file" "SQL filename"; then
            continue
        fi
        
        if [[ " ${sql_files[*]} " =~ " ${sql_file} " ]]; then
            log_warning "File '$sql_file' already added!"
            continue
        fi
        
        sql_files+=("$sql_file")
        log_success "Added: $sql_file"
    done
    
    print_separator
    
    if [ ${#sql_files[@]} -eq 0 ]; then
        log_warning "No files specified for $category_upper"
        return 0
    fi
    
    # Only create/update master changelog for SIO2 option
    if [ "$category" != "$PARAM_CATEGORY" ]; then
        # Create master changelog if it doesn't exist
        if [ ! -f "$master_changelog" ]; then
            # Create initial XML structure without closing tag
            {
                echo '<databaseChangeLog'
                echo "  xmlns=\"$XML_SCHEMA\""
                echo "  xmlns:xsi=\"$XML_XSI\""
                echo "  xsi:schemaLocation=\"$XML_SCHEMA"
                echo "                      $XML_LOCATION\">"
            } > "$master_changelog"
        else
            # Backup the file without the closing tag
            sed -i.bak '/<\/databaseChangeLog>/d' "$master_changelog"
            rm -f "${master_changelog}.bak"
        fi
    fi
    
    # Create files
    for sql_file in "${sql_files[@]}"; do
        local xml_file="$category/$sql_file.xml"
        local sql_file_path="$category/sql/$sql_file.sql"
        
        # Check if SQL file exists but XML doesn't
        if [ -f "$sql_file_path" ] && [ ! -f "$xml_file" ]; then
            # Create XML file
            create_xml_file "$xml_file" "$author" "$sql_file"
            if [ "$category" != "$PARAM_CATEGORY" ]; then
                # Append include to master changelog only for SIO2 option
                echo "  <include relativeToChangelogFile=\"true\" file=\"$category/$sql_file.xml\"/>" >> "$master_changelog"
            fi
            log_success "Created XML file for existing SQL: $xml_file"
            continue
        fi
        
        # Skip if both files already exist
        if [ -f "$xml_file" ] && [ -f "$sql_file_path" ]; then
            log_info "Files for $sql_file already exist, skipping..."
            continue
        fi
        
        # Create SQL file if it doesn't exist
        if [ ! -f "$sql_file_path" ]; then
            if ! touch "$sql_file_path"; then
                log_error "Failed to create $sql_file_path"
                continue
            fi
        fi
        
        # Create XML file if it doesn't exist
        if [ ! -f "$xml_file" ]; then
            create_xml_file "$xml_file" "$author" "$sql_file"
        fi
        
        if [ "$category" != "$PARAM_CATEGORY" ]; then
            # Append include to master changelog only for SIO2 option
            echo "  <include relativeToChangelogFile=\"true\" file=\"$category/$sql_file.xml\"/>" >> "$master_changelog"
        fi
        
        log_success "Created: $xml_file and $sql_file_path"
    done
    
    # Only close master changelog for SIO2 option
    if [ "$category" != "$PARAM_CATEGORY" ]; then
        # Add closing tag to master changelog
        echo "</databaseChangeLog>" >> "$master_changelog"
        log_success "Updated master changelog: $master_changelog"
    fi
}

create_structure() {
    local author=$1
    local version=$2
    local category=$3
    local category_upper=${category^^}
    
    print_header "Processing $category_upper Category"
    
    while true; do
        echo -e "${YELLOW}Do you want to add files to the $category_upper category?${NC}"
        read -rp $'\033[0;36m(y/n)>\033[0m ' has_files
        
        if [[ "$has_files" =~ ^[Yy]$ ]]; then
            if ! create_directory_structure "$category"; then
                return 1
            fi
            process_sql_files "$category" "$author" "$version"
            break
        elif [[ "$has_files" =~ ^[Nn]$ ]]; then
            log_info "Skipping $category_upper category"
            break
        else
            echo -e "${RED}Invalid input. Please enter 'y' or 'n'${NC}"
        fi
    done
}

# Function to read version from tag-database.xml
get_version_from_tag() {
    if [ -f "tag-database.xml" ]; then
        local version
        # Get the version and remove .0.0 suffix
        version=$(grep -oP '<tagDatabase tag="\K[^"]+' tag-database.xml | sed 's/\.0\.0$//')
        echo "$version"
        return 0
    fi
    return 1
}

# Add this function to create tag-database.xml
create_tag_database() {
    local author=$1
    local version=$2
    
    if [ ! -f "tag-database.xml" ]; then
        cat > "tag-database.xml" << EOL
<databaseChangeLog
  xmlns="http://www.liquibase.org/xml/ns/dbchangelog"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.liquibase.org/xml/ns/dbchangelog
                      http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-3.3.xsd">
                      
  <changeSet author="$author" id="tag-database">
    <tagDatabase tag="$version.0.0"/>
  </changeSet>
</databaseChangeLog>
EOL
        log_success "Created tag-database.xml with version $version"
    fi
}

# Add this new function
update_main_changelog() {
    local version=$1
    local main_changelog="changelog-SIO2-all.xml"
    
    # Create or truncate the main changelog file
    cat > "$main_changelog" << EOL
<databaseChangeLog
  xmlns="$XML_SCHEMA"
  xmlns:xsi="$XML_XSI"
  xsi:schemaLocation="$XML_SCHEMA
                      $XML_LOCATION">
  
  <!-- Definition de la version -->
  <!-- -->
  <include relativeToChangelogFile="true" file="tag-database.xml"/>

  <!-- Ajouter tous les version à installer -->
EOL
    
    # Add existing changelog files
    for category in "${CATEGORIES[@]}"; do
        local category_changelog="changelog-$version-${category^^}.xml"
        if [ -f "$category_changelog" ]; then
            echo "  <include relativeToChangelogFile=\"true\" file=\"$category_changelog\"/>" >> "$main_changelog"
            log_success "Added $category_changelog to main changelog"
        fi
    done
    
    # Close the main changelog
    echo "</databaseChangeLog>" >> "$main_changelog"
    log_success "Updated main changelog: $main_changelog"
}

# Add new function for param changelog
update_param_changelog() {
    local version=$1
    local param_changelog="changelog-Order-Managers-Param-DATA.xml"
    
    # Create or truncate the param changelog file
    cat > "$param_changelog" << EOL
<databaseChangeLog
  xmlns="$XML_SCHEMA"
  xmlns:xsi="$XML_XSI"
  xsi:schemaLocation="$XML_SCHEMA
                      $XML_LOCATION">
  
  <!-- Definition de la version -->
  <!-- -->
  <include relativeToChangelogFile="true" file="tag-database.xml"/>

  <!-- Ajouter les changements de données -->
EOL
    
    # Add data changelog files if they exist
    if [ -d "$PARAM_CATEGORY" ]; then
        for xml_file in "$PARAM_CATEGORY"/*.xml; do
            if [ -f "$xml_file" ]; then
                echo "  <include relativeToChangelogFile=\"true\" file=\"$xml_file\"/>" >> "$param_changelog"
                log_success "Added $(basename "$xml_file") to param changelog"
            fi
        done
    fi
    
    # Close the changelog
    echo "</databaseChangeLog>" >> "$param_changelog"
    log_success "Updated param changelog: $param_changelog"
}

# Add function to handle param workflow
handle_param_option() {
    local author=$1
    local version=$2
    
    print_header "Processing Param Category"
    
    # Create data directory structure
    if ! create_directory_structure "$PARAM_CATEGORY"; then
        log_error "Failed to create data directory structure"
        return 1
    fi
    
    # Process SQL files for data category
    process_sql_files "$PARAM_CATEGORY" "$author" "$version"
    
    # Update the param changelog
    update_param_changelog "$version"
}

# Add function to handle SIO2 workflow
handle_sio2_option() {
    local author=$1
    local version=$2
    
    print_header "Processing SIO2-Back Categories"
    
    # Process each category
    for category in "${CATEGORIES[@]}"; do
        if ! create_structure "$author" "$version" "$category"; then
            log_error "Failed to process $category"
            continue
        fi
    done
    
    # Update the main changelog
    update_main_changelog "$version"
}

# Modified main function to include option selection
main() {
    print_header "Liquibase Changelog Generator"
    
    local author version option
    
    # Present options
    echo -e "${CYAN}Please select an option:${NC}"
    echo -e "1. SIO2-Back"
    echo -e "2. Param"
    
    while true; do
        read -rp $'\033[0;36m>\033[0m ' option
        if [[ "$option" =~ ^[12]$ ]]; then
            break
        else
            echo -e "${RED}Invalid option. Please select 1 or 2${NC}"
        fi
    done
    
    # Get and validate author
    while true; do
        echo -e "\n${CYAN}Please enter the author name:${NC}"
        read -rp $'\033[0;36m>\033[0m ' author
        if validate_input "$author" "Author name"; then
            break
        fi
    done
    
    # Check for existing tag-database.xml and get version
    if ! version=$(get_version_from_tag); then
        while true; do
            echo -e "\n${CYAN}Please enter the version number:${NC}"
            read -rp $'\033[0;36m>\033[0m ' version
            if validate_input "$version" "Version"; then
                create_tag_database "$author" "$version"
                break
            fi
        done
    else
        log_info "Using existing version: $version from tag-database.xml"
    fi
    
    print_separator
    
    # Handle selected option
    case $option in
        1)
            handle_sio2_option "$author" "$version"
            ;;
        2)
            handle_param_option "$author" "$version"
            ;;
    esac
    
    print_separator
    log_success "Structure creation completed successfully!"
    echo -e "${GREEN}You can now start adding your SQL commands to the generated files.${NC}"
    
    # Add pause before exit
    echo -e "\n${YELLOW}Press Any key to exit...${NC}"
    read -r
}

# Simply call main
main
