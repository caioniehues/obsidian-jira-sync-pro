#!/bin/bash

# Development tools for Obsidian Jira Sync Pro Plugin
# This script helps manage the development workflow

PLUGIN_NAME="obsidian-jira-sync-pro"
DEV_DIR="/Users/caio.niehues/Developer/$PLUGIN_NAME"
VAULT_PLUGIN_DIR="/Users/caio.niehues/ObsidianVault/.obsidian/plugins/$PLUGIN_NAME"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

function print_menu() {
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}     Obsidian Jira Sync Pro - Dev Tools${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    echo "1) Build plugin"
    echo "2) Build and reload Obsidian (macOS)"
    echo "3) Setup/verify symlinks"
    echo "4) Run tests"
    echo "5) Type check"
    echo "6) Watch mode (auto-rebuild)"
    echo "7) Check plugin status"
    echo "8) Backup settings"
    echo "9) Restore settings"
    echo "0) Exit"
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
}

function build_plugin() {
    echo -e "${BLUE}Building plugin...${NC}"
    cd "$DEV_DIR"
    npm run build
    echo -e "${GREEN}✅ Build complete!${NC}"
}

function reload_obsidian() {
    echo -e "${BLUE}Reloading Obsidian...${NC}"
    # Try to reload Obsidian using AppleScript (macOS only)
    osascript -e 'tell application "Obsidian" to quit' 2>/dev/null
    sleep 1
    open -a Obsidian
    echo -e "${GREEN}✅ Obsidian reloaded!${NC}"
}

function setup_symlinks() {
    echo -e "${BLUE}Setting up symlinks...${NC}"
    
    # Create plugin directory if it doesn't exist
    if [ ! -d "$VAULT_PLUGIN_DIR" ]; then
        mkdir -p "$VAULT_PLUGIN_DIR"
        echo "Created plugin directory"
    fi
    
    # Backup data.json if it exists
    if [ -f "$VAULT_PLUGIN_DIR/data.json" ]; then
        cp "$VAULT_PLUGIN_DIR/data.json" "$VAULT_PLUGIN_DIR/data.json.backup"
        echo "Backed up existing settings"
    fi
    
    # Remove existing files (not symlinks)
    if [ -f "$VAULT_PLUGIN_DIR/main.js" ] && [ ! -L "$VAULT_PLUGIN_DIR/main.js" ]; then
        rm "$VAULT_PLUGIN_DIR/main.js"
    fi
    if [ -f "$VAULT_PLUGIN_DIR/manifest.json" ] && [ ! -L "$VAULT_PLUGIN_DIR/manifest.json" ]; then
        rm "$VAULT_PLUGIN_DIR/manifest.json"
    fi
    
    # Create symlinks if they don't exist
    if [ ! -L "$VAULT_PLUGIN_DIR/main.js" ]; then
        ln -s "$DEV_DIR/main.js" "$VAULT_PLUGIN_DIR/main.js"
        echo "Created symlink for main.js"
    else
        echo "Symlink for main.js already exists"
    fi
    
    if [ ! -L "$VAULT_PLUGIN_DIR/manifest.json" ]; then
        ln -s "$DEV_DIR/manifest.json" "$VAULT_PLUGIN_DIR/manifest.json"
        echo "Created symlink for manifest.json"
    else
        echo "Symlink for manifest.json already exists"
    fi
    
    echo -e "${GREEN}✅ Symlinks configured!${NC}"
}

function run_tests() {
    echo -e "${BLUE}Running tests...${NC}"
    cd "$DEV_DIR"
    npm test
}

function type_check() {
    echo -e "${BLUE}Running TypeScript type check...${NC}"
    cd "$DEV_DIR"
    npx tsc --noEmit
}

function watch_mode() {
    echo -e "${BLUE}Starting watch mode (Ctrl+C to stop)...${NC}"
    cd "$DEV_DIR"
    npm run dev
}

function check_status() {
    echo -e "${BLUE}Plugin Status:${NC}"
    echo ""
    
    # Check if symlinks exist
    echo "Symlinks:"
    if [ -L "$VAULT_PLUGIN_DIR/main.js" ]; then
        echo -e "  main.js: ${GREEN}✅ Linked${NC}"
    else
        echo -e "  main.js: ${RED}❌ Not linked${NC}"
    fi
    
    if [ -L "$VAULT_PLUGIN_DIR/manifest.json" ]; then
        echo -e "  manifest.json: ${GREEN}✅ Linked${NC}"
    else
        echo -e "  manifest.json: ${RED}❌ Not linked${NC}"
    fi
    
    # Check if settings exist
    echo ""
    echo "Settings:"
    if [ -f "$VAULT_PLUGIN_DIR/data.json" ]; then
        echo -e "  data.json: ${GREEN}✅ Exists${NC}"
        # Show file size
        SIZE=$(ls -lh "$VAULT_PLUGIN_DIR/data.json" | awk '{print $5}')
        echo "  Size: $SIZE"
    else
        echo -e "  data.json: ${RED}❌ Not found${NC}"
    fi
    
    # Check last build time
    echo ""
    echo "Last build:"
    if [ -f "$DEV_DIR/main.js" ]; then
        MODIFIED=$(date -r "$DEV_DIR/main.js" "+%Y-%m-%d %H:%M:%S")
        echo "  $MODIFIED"
    else
        echo -e "  ${RED}Not built yet${NC}"
    fi
}

function backup_settings() {
    echo -e "${BLUE}Backing up settings...${NC}"
    if [ -f "$VAULT_PLUGIN_DIR/data.json" ]; then
        TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
        cp "$VAULT_PLUGIN_DIR/data.json" "$DEV_DIR/backups/data_$TIMESTAMP.json"
        mkdir -p "$DEV_DIR/backups"
        echo -e "${GREEN}✅ Settings backed up to backups/data_$TIMESTAMP.json${NC}"
    else
        echo -e "${RED}No settings file found${NC}"
    fi
}

function restore_settings() {
    echo -e "${BLUE}Available backups:${NC}"
    if [ -d "$DEV_DIR/backups" ]; then
        ls -la "$DEV_DIR/backups/"
        echo ""
        echo "Enter backup filename to restore (or 'cancel'):"
        read BACKUP_FILE
        if [ "$BACKUP_FILE" != "cancel" ] && [ -f "$DEV_DIR/backups/$BACKUP_FILE" ]; then
            cp "$DEV_DIR/backups/$BACKUP_FILE" "$VAULT_PLUGIN_DIR/data.json"
            echo -e "${GREEN}✅ Settings restored from $BACKUP_FILE${NC}"
        fi
    else
        echo "No backups found"
    fi
}

# Main loop
while true; do
    print_menu
    echo -n "Select an option: "
    read choice
    
    case $choice in
        1) build_plugin ;;
        2) build_plugin && reload_obsidian ;;
        3) setup_symlinks ;;
        4) run_tests ;;
        5) type_check ;;
        6) watch_mode ;;
        7) check_status ;;
        8) backup_settings ;;
        9) restore_settings ;;
        0) echo -e "${GREEN}Goodbye!${NC}"; exit 0 ;;
        *) echo -e "${RED}Invalid option${NC}" ;;
    esac
    
    echo ""
    echo "Press Enter to continue..."
    read
    clear
done