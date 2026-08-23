# Random Collection of smaller TODOs

Not ordered by priority. Tick off items as you complete them. Commit after each item. Never add a co-author.
Complete in chronological order.

- [x] Toolbar > Tags > Tags List Popover > Single Tag Item: has three actions on hover. leftmost action is open on github. it currently has a "Tag" icon, transform into an external link icon.
- [x] Preview Pull Request Dialog > Milestone selector: if not milestone is selected, the placeholder text should be a lower opacity grey (just like for the other three selectors above). currently is full white
- [x] fix branch deletion after PR merge if it was enabled. currently only deletes on remote, leaves the local branch as local-only. should delete the local branch after merge and move user to default branch as dodge
- [x] Pull Request Tab > Single PR > File Explorer: needs to be horizontally resizable
- [x] "Add to .gitignore" action in right click menu on files (as single file action or multiple file action)
- [x] commit history > single commit > main pane > above the file explorer + diff viewer: display commit message: summary as title, commit description as description below it. also display the authors (avatars; hoverable to show their names in a tooltip), commit date, commit hash (copiable; copy button that turns into green checkmark for 2 seconds), lines added/removed and tag (if any)
- [x] changes tab > filed explorer: we need to add detection for file moving. currently would pick up moved files as added/deleted pairs
- [x] files in all file explorers (PR, commits, stash, changes tab): they have a dot indicator (green/red) that indicates the status of the file (modified, deleted, added, etc.). make sure we specify more precisely. green = creaded, red = deleted, orange = modified, blue = moved. also, dont display a dot indicator. on the far right of the file name, display the status as an icon. make sure this icon is never pushed away by a long file name (long file paths must be truncated in the middle, just like we are currently doing)
- [x] Toolbar > Preview PR button: disable the button if no commit exists on the current branch or if no other branch exists. in both cases, disable the button and add a toolbar explaining why the button is disabled (in a VERY short and clear way. no long sentence.)
- [x] Changes > File Explorer > Right Click > Open in Editor option: Zed logo needs to be a little larger (inspired by the VS Code logo)
- [x] History Tab: show unpushed commits in a different way than pushed commits
- [x] Hostory Tab: add a compact mode. compact mode only shows the current branch's graph and hides all other branches. it should only show when something was merged into the current branch or out of it. but dont show all branches parallel to each other, just the branching out and in from the current branch
- [x] (BUG) Settings > General > Favorite Editor: The selector isnt scrollable
- [x] Pull Request Tab > Single PR > "Merge..." button > Dialog: add an option to change the target branch
- [x] Any diff viewer: a feature we want is inline diff viewing. if only a small portion of a line is changed, we currently show the whole line removed and added again but we highlight the changed portion. this is good and should stay. however, when there was a lot of change in a line, the porbablity for it matching with the old version on some singular letters is high. this can get really messy. so if the changed portion of a line is above 10-20 characters, we should show the whole line removed and added again instead of highlighting the changed portion
- [ ] Command palette: switch from substring match to fuzzy scored match (goto anything style)
- [ ] add an interface for resolving this error when pushing and pulling at the same time: "Diverging branches can't be fast-forwarded"
- [ ] Add keyboard arrow-key navigation to lists (commits, files, branches, PRs)
- [ ] Diff viewer: add setting for diff algorithm choice (myers/patience/histogram/minimal)
- [ ] Fixup commit + autosquash: quick "commit --fixup" action from commit context menu, plus rebase -i --autosquash support
