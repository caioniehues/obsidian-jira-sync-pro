# Obsidian Jira Sync Pro - Project Overview

## Project Purpose
Enhanced Obsidian plugin for automatic Jira ticket synchronization with JQL-based queries, auto-sync scheduling, and bulk import capabilities.

## Key Features
- 🔍 **JQL-based Sync**: Use powerful JQL queries to select exactly which tickets to sync
- ⏰ **Auto-Sync Scheduler**: Configurable automatic synchronization (1-60 minute intervals)
- 📦 **Bulk Import**: Progressive import with progress tracking for initial setup
- 📊 **Status Dashboard**: Monitor sync health and statistics
- ⚡ **Performance Optimized**: Pagination, field selection, and rate limit handling

## Tech Stack
- **Language**: TypeScript 4.9+
- **Framework**: Obsidian Plugin API v1.4.0+
- **API Integration**: Jira REST API v3 (new JQL search endpoints)
- **Testing**: Jest with jsdom environment, ts-jest
- **Build Tool**: Vite
- **Linting**: ESLint with TypeScript plugin
- **Package Manager**: npm

## Critical Information
- **API Migration Deadline**: May 1, 2025 - Must migrate from deprecated Jira API endpoints
- **New Endpoint**: `POST /rest/api/3/search/jql` (replacing `POST /rest/api/3/search`)
- **Pagination**: Token-based using `nextPageToken` (replacing `startAt`)

## Project Metadata
- **Plugin ID**: obsidian-jira-sync-pro
- **Version**: 1.0.0
- **Author**: Caio Niehues
- **License**: MIT
- **Min Obsidian Version**: 1.4.0