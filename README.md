# Albion Builds

Web build planner for Albion Online — **https://iletora.github.io/albion-builds/**

 Plain HTML/CSS/JS, no build step — runs on GitHub Pages as is.

## Features
- Build sets in tabs, each with a name (e.g. "ZvZ kite clap"), a multi-line description and any number of rows
- 8 slots per row: weapon, off-hand, head, armor, shoes, cape, potion, food
- Up to 3 items per slot: main item plus alternatives (shown small next to it)
- Notes for every row
- Copy / download PNG for every 10 rows (1–10, 11–20, …) with notes and description, Ubuntu font
- Save all sets to a `.txt` file and open it later on any computer (or drop the file onto the page)
- Share link: the current set is packed into the URL
- Random build per row (🎲)
- Drag rows by the ⋮⋮ handle, duplicate, delete, undo/redo (Ctrl+Z / Ctrl+Y)
- Autosave in the browser

Right-click a slot to clear it. Two-handed weapons lock the off-hand slot.

## Publish on GitHub Pages
1. Create a new repository and upload all files from this folder (keep the folder structure).
2. Repository → Settings → Pages → Source: *Deploy from a branch*, Branch: `main`, folder `/ (root)`.
3. The site appears at `https://<your-name>.github.io/<repo-name>/` in a minute or two.

## Run locally
Just open `index.html`. For PNG export from a local file the icons are taken from `icons-data.js`
(browsers block exporting canvas images built from local files).

## Adding new items
1. Put the icon into `icons/items/` named by its item ID, e.g. `T8_2H_NEWSWORD.png` (128×128 is enough).
2. Add the ID to the right group in `items.js`.
3. Run `python tools/build-icons-data.py` so local PNG export knows the new icon too (the website itself doesn't need it).

IDs containing `_2H_` are treated as two-handed.

## Save file format
JSON in a `.txt` file:
```json
{ "app": "albion-builds", "version": 1, "sets": [
  { "title": "ZvZ kite clap", "desc": "Comp for 20 players", "rows": [
    { "slots": { "weapon": ["T8_2H_POLEHAMMER"], "offhand": [], "head": [], "armor": [],
                 "shoes": ["T8_SHOES_CLOTH_AVALON", "T8_SHOES_LEATHER_HELL"],
                 "cape": [], "potion": [], "food": [] },
      "notes": "Main tank" } ] } ] }
```
