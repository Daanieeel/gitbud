# Random Collection of smaller TODOs

Not ordered by priority. Tick off items as you complete them. Commit after each item. Never add a co-author.
Complete in chronological order.

- [x] repos in sidebar need "Open in Browser" (with git provider's logo) and "Open in <editor>"
- [x] Repo > Toolbar (top) > Next to the open on git provider button: "Open in <editor>" (editor icon as the button, just like the open on git provider button)
- [x] when creating a new branch, i can see the last commit that was made (to the branch i am coming from) below the commit button and the corresponding undo button. this happens only while the new branch is local-only. as soon as i publish it, the last commit is no longer visible. this last commit was already pushed and should not have been visible in the first place. fix this.
- [x] improve memory footprint (tauri://localhost can go up to 200MB sometimes) by reducing caching/running tighter cache eviction policies and reducing polling in places where it is not necessary (and make sure we are not polling the same data multiple times in different places instead of once in a central location)
- [x] split the "Update all" button into separate "Fetch all" and "pull all" buttons
- [ ] improve auto-staging new changes (sometimes doesnt pick up new changes; often when changes are made to a file that is already staged -> new changes then remain unstaged)
