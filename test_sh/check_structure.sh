#!/bin/bash

# Remove the strict mode to allow continuation after errors
# set -euo pipefail

# Color codes
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m'

# Constants
readonly CATEGORIES=("tables" "views" "materialized_views" "procedures" "sequences")

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} [$1]: $2" >&2; }
log_error() { echo -e "${RED}[ERROR]${NC} [$1]: $2" >&2; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} [$1]: $2" >&2; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} [$1]: $2" >&2; }

# Function to read version from tag-database.xml
get_version_from_tag() {
    if [ -f "tag-database.xml" ]; then
        local version
        version=$(grep -oP '<tagDatabase tag="\K[^"]+' tag-database.xml | sed 's/\.0\.0$//')
        echo "$version"
        return 0
    fi
    return 1
}

check_changelog_references() {
    local category=$1
    local errors=0
    local version
    version=$(get_version_from_tag)
    local master_changelog="changelog-$version-${category^^}.xml"

    # Check if files referenced in master changelog exist
    if [ -f "$master_changelog" ]; then
        while IFS= read -r line || [[ -n "$line" ]]; do
            if [[ $line =~ file=\"([^\"]+)\" ]]; then
                local referenced_file="${BASH_REMATCH[1]}"
                if [ ! -f "$referenced_file" ]; then
                    log_error "$category" "File referenced in changelog does not exist: $referenced_file"
                    ((errors++))
                fi
            fi
        done < "$master_changelog"
    fi

    # Check SQL files referenced in XML changesets
    if [ -d "$category" ]; then
        for xml_file in "$category"/*.xml; do
            if [ -f "$xml_file" ] && [[ "$xml_file" != *"changelog-"* ]]; then
                while IFS= read -r line || [[ -n "$line" ]]; do
                    if [[ $line =~ path=\"([^\"]+)\" ]]; then
                        local sql_path="${BASH_REMATCH[1]}"
                        local full_sql_path="$category/$sql_path"
                        if [ ! -f "$full_sql_path" ]; then
                            log_error "$category" "SQL file referenced in ${xml_file} does not exist: $sql_path"
                            ((errors++))
                        fi
                    fi
                done < "$xml_file"
            fi
        done
    fi

    return $errors
}

check_orphaned_files() {
    local category=$1
    local errors=0
    local version
    version=$(get_version_from_tag)
    local master_changelog="changelog-$version-${category^^}.xml"

    echo -e "\n${CYAN}Checking $category for orphaned files...${NC}"

    # Check for SQL files without XML
    if [ -d "$category/sql" ]; then
        shopt -s nullglob
        for sql_file in "$category/sql"/*.sql; do
            if [ -f "$sql_file" ]; then
                local base_name=$(basename "$sql_file" .sql)
                local xml_file="$category/$base_name.xml"
                if [ ! -f "$xml_file" ]; then
                    log_error "$category" "SQL file without XML: $base_name"
                    ((errors++))
                fi
            fi
        done
        shopt -u nullglob
    fi

    # Check for XML files without SQL and not in changelog
    if [ -d "$category" ]; then
        shopt -s nullglob
        for xml_file in "$category"/*.xml; do
            if [ -f "$xml_file" ] && [[ "$xml_file" != *"changelog-"* ]]; then
                local base_name=$(basename "$xml_file" .xml)
                local sql_file="$category/sql/$base_name.sql"

                # Check if XML has corresponding SQL
                if [ ! -f "$sql_file" ]; then
                    log_error "$category" "XML file without SQL: $base_name"
                    ((errors++))
                fi

                # Check if XML is declared in changelog
                if [ -f "$master_changelog" ]; then
                    if ! grep -q "file=\"$category/$base_name.xml\"" "$master_changelog"; then
                        log_error "$category" "XML file not declared in changelog: $base_name"
                        ((errors++))
                    fi
                fi
            fi
        done
        shopt -u nullglob
    fi

    return $errors
}

main() {
    echo -e "\n${CYAN}=== Liquibase Structure Checker ===${NC}\n"
    local total_errors=0

    # Check each category
    for category in "${CATEGORIES[@]}"; do
        echo -e "\n${CYAN}Checking $category...${NC}"

        # Check for orphaned files
        check_orphaned_files "$category"
        ((total_errors+=$?))

        # Check references in changelog and changesets
        check_changelog_references "$category"
        ((total_errors+=$?))
    done

    if [ $total_errors -eq 0 ]; then
        log_success "All checks passed successfully!"
        return 0
    else
        log_error "Found $total_errors error(s)"
        return 1
    fi
}

main