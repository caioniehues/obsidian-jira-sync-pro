# 🚀 Testing Guide - Obsidian Jira Sync Pro

## ✅ Plugin Status: READY FOR TESTING!

The plugin now has **complete note creation functionality** and is ready to sync with your real Jira instance.

## 🎯 What's New

- ✅ **SimpleNoteService** implemented - Creates and updates notes in your vault
- ✅ **Note organization** - Automatically organizes tickets by project
- ✅ **Local notes preservation** - Your personal notes are preserved during sync
- ✅ **Rich formatting** - Converts Jira markup to Markdown
- ✅ **Progress tracking** - Shows detailed sync statistics
- ✅ **Error handling** - Graceful error recovery

## 📋 Installation Steps

### 1. Copy Plugin to Obsidian

```bash
# Create plugin directory in your vault (if it doesn't exist)
mkdir -p /path/to/your/vault/.obsidian/plugins/obsidian-jira-sync-pro

# Copy the built files
cp main.js manifest.json /path/to/your/vault/.obsidian/plugins/obsidian-jira-sync-pro/
```

### 2. Enable Plugin in Obsidian

1. Open Obsidian Settings (⚙️)
2. Go to **Community plugins**
3. Make sure **Safe mode** is OFF
4. Click **Reload plugins**
5. Find "Jira Sync Pro" in the list
6. Toggle it ON ✅

## 🔧 Configuration

### 3. Configure Jira Settings

1. Go to Plugin Settings → **Jira Sync Pro**
2. Enter your Jira details:

#### Required Settings:
- **Jira URL**: `https://your-company.atlassian.net`
- **Username**: Your email (e.g., `you@company.com`)
- **API Token**: Get from [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)

#### Recommended JQL Queries:
```sql
-- Your assigned tickets (last 7 days)
assignee = currentUser() AND updated >= -7d

-- All open tickets in your project
project = "YOUR_PROJECT" AND status NOT IN (Done, Closed)

-- High priority tickets
priority IN (Highest, High) AND status = "In Progress"

-- Sprint tickets
sprint in openSprints()
```

#### Sync Settings:
- **Sync Interval**: 5-15 minutes (recommended)
- **Max Results**: Start with 50-100 for testing
- **Batch Size**: 25 (optimal for performance)
- **Sync Folder**: `Areas/Work/Jira Tickets` (or your preference)

### 4. Test Connection

1. Click **Test Connection** button in settings
2. You should see: ✅ Connection successful!

## 🧪 Testing Steps

### Phase 1: Manual Sync Test

1. **Open Command Palette** (Cmd/Ctrl + P)
2. Run: `Jira Sync Pro: Test connection`
   - Verify connection works
3. Run: `Jira Sync Pro: Manual sync now`
   - Watch for progress notifications
   - Check your sync folder for created notes

### Phase 2: Verify Note Creation

Check that notes were created in: `[Your Vault]/Areas/Work/Jira Tickets/[PROJECT]/`

Each note should have:
- ✅ Frontmatter with ticket metadata
- ✅ Formatted ticket content
- ✅ Status, assignee, priority info
- ✅ Description in Markdown
- ✅ Comments from Jira
- ✅ Links back to Jira
- ✅ Local notes section (preserved on sync)

### Phase 3: Update Test

1. Make a change to a ticket in Jira
2. Add some local notes to the Obsidian note (below "Local Notes" section)
3. Run manual sync again
4. Verify:
   - Jira changes are reflected
   - Your local notes are preserved

### Phase 4: Bulk Import Test

1. Run: `Jira Sync Pro: Bulk import tickets`
2. Review the import dialog
3. Click **Start Import**
4. Monitor progress bar
5. Check imported tickets

### Phase 5: Auto-Sync Test

1. Enable **Auto-sync** in settings
2. Set interval to 1 minute (for testing)
3. Make a change in Jira
4. Wait for auto-sync
5. Verify changes appear

## 📊 Expected Results

### Successful Sync Should Show:

```
Jira Sync Pro: Sync complete!
✅ Success: 45/50
📝 Created: 30
🔄 Updated: 15
⏭️ Skipped: 3
❌ Errors: 2
```

### Note Structure Example:

```markdown
---
ticket: PROJ-123
title: Implement user authentication
status: In Progress
assignee: John Doe
priority: High
type: Story
project: PROJECT
created: 2024-01-15 10:30
updated: 2024-01-20 14:45
jira_url: https://company.atlassian.net/browse/PROJ-123
sync_date: 2024-01-20T19:45:00.000Z
tags:
  - jira
  - project
  - in-progress
---

# [PROJ-123] Implement user authentication

## 📊 Status Information
- **Status**: In Progress
- **Priority**: High 🟠
- **Type**: Story
- **Assignee**: [[John Doe]]
- **Reporter**: [[Jane Smith]]
- **Project**: [[PROJECT]]

## 📝 Description
As a user, I want to be able to log in securely...

## 💬 Comments
### John Doe - Jan 20, 2024, 2:30 PM
Started working on the OAuth integration...

## ✅ Subtasks
- [x] **PROJ-124**: Design login UI (Done)
- [ ] **PROJ-125**: Implement OAuth (In Progress)

## 🔗 Links
- [View in Jira](https://company.atlassian.net/browse/PROJ-123)

---
*Last synchronized: 1/20/2024, 2:45:00 PM*

## 📌 Local Notes
<!-- Add your personal notes below this line. They will be preserved during sync. -->

Your notes here are safe and won't be overwritten!
```

## 🐛 Troubleshooting

### Connection Issues

**401 Unauthorized**
- Check API token is correct
- Verify username is your email
- Regenerate API token if needed

**403 Forbidden**
- Check you have access to the Jira project
- Verify Jira URL is correct (no trailing slash)

**Network Error**
- Check internet connection
- Verify Jira URL (should be https://)
- Check firewall/proxy settings

### Sync Issues

**No tickets found**
- Verify JQL query in Jira's issue search first
- Check you have permissions to view tickets
- Try a simpler query: `assignee = currentUser()`

**Notes not creating**
- Check sync folder exists
- Verify Obsidian has write permissions
- Check console for errors (Ctrl/Cmd + Shift + I)

**Duplicate notes**
- This shouldn't happen with current implementation
- Check if tickets have duplicate keys
- Report issue if persists

## 📈 Performance Tips

1. **Start Small**: Begin with 10-20 tickets
2. **Optimize JQL**: Use date filters to limit results
3. **Batch Size**: Keep at 25 for best performance
4. **Sync Interval**: 10-15 minutes is usually sufficient
5. **Max Results**: Increase gradually (100 → 500 → 1000)

## ✨ Features to Try

1. **Organization by Project**: Notes are auto-organized in project folders
2. **Priority Emojis**: Visual indicators for priority levels
3. **Wikilinks**: Assignees and projects become [[wikilinks]]
4. **Local Notes**: Add your thoughts below the marker line
5. **Comments**: Recent Jira comments are included
6. **Subtasks**: Checkbox list of subtasks with status

## 🎉 Success Checklist

- [ ] Plugin installed and enabled
- [ ] Jira credentials configured
- [ ] Test connection successful
- [ ] Manual sync creates notes
- [ ] Notes properly formatted
- [ ] Local edits preserved on re-sync
- [ ] Auto-sync working
- [ ] Bulk import successful

## 📞 Need Help?

1. **Check Console**: Cmd/Ctrl + Shift + I for detailed errors
2. **Review Logs**: Look for "Jira Sync Pro:" messages
3. **Simple JQL**: Start with `assignee = currentUser()`
4. **Permissions**: Verify Jira access in browser first
5. **Report Issues**: Include console errors and settings

## 🚀 Next Steps

Once basic sync is working:

1. **Customize Templates**: Modify note format in SimpleNoteService
2. **Add Custom Fields**: Map additional Jira fields
3. **Create Workflows**: Use Obsidian Templater/Dataview with synced data
4. **Build Dashboards**: Create overview pages with queries
5. **Automate Tasks**: Set up QuickAdd macros for Jira actions

---

**🎊 Congratulations!** Your Obsidian vault is now connected to Jira. The plugin will keep your tickets synchronized and organized, letting you work with Jira data using Obsidian's powerful features.

Happy syncing! 🚀