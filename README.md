# Where Is the Hidden Pokémon?

An audio-led Pokémon hunt inspired by [Find the Invisible Cow](https://findtheinvisiblecow.com/). Follow a cry across the full screen as it gets louder and more frequent, click the hidden Pokémon, then identify it from four choices.

## [Play the live game →](https://yannygao.github.io/where-is-the-hidden-pokemon/)

## Run locally

From this folder, start any static web server:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Features

- Sound-guided mouse and touch hunts using real game cries loaded from PokéAPI
- A four-choice “Who’s That Pokémon?” question after every successful find
- Generation I–IX filters plus an all-generations mode
- A complete National Pokédex where only correctly identified Pokémon are revealed
- Optional Pokémon cursors: choose a correctly identified Pokémon to replace the hunt pointer, with no location hints
- Animated Pokémon sprites for cursor and discovery moments
- Persistent discoveries and identification results saved in `localStorage`
- Keyboard shortcut (`Space` to replay the current cry)
- Responsive desktop and mobile layouts
- Loading, empty, offline, and audio-error states

## Data

Pokémon metadata and media URLs are retrieved from [PokéAPI](https://pokeapi.co/), a community-maintained API. Pokémon and Pokémon character names are trademarks of Nintendo. Pokémon © Nintendo / Creatures Inc. / GAME FREAK inc.
