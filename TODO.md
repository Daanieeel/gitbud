# Random Collection of smaller TODOs

Not ordered by priority. Tick off items as you complete them. Commit after each item. Never add a co-author.
Complete in chronological order.

- [ ] improve auto-staging new changes (sometimes doesnt pick up new changes; often when changes are made to a file that is already staged -> new changes then remain unstaged)
- [ ] improve memory footprint (tauri://localhost can go up to 200MB sometimes) by reducing caching/running tighter cache eviction policies and reducing polling in places where it is not necessary (and make sure we are not polling the same data multiple times in different places instead of once in a central location)
