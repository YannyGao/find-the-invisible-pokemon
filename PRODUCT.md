# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated: a dependency-free static HTML/CSS/JavaScript app, chosen for fast startup, easy local use, and simple deployment.

## Users

Casual Pokémon fans who want to discover and recognize Pokémon by their cries through short, playful hunts on desktop or mobile.

## Product Purpose

Turn cry recognition into a hot-and-cold search game: players follow a spatial signal, find an invisible Pokémon, identify it, and reveal it in their locally saved Pokédex.

## Positioning

“Find the Invisible Pokémon” follows a listen, navigate, find, identify, and collect loop. The concept is explicitly inspired by Find the Invisible Cow and extends it with a full-screen search field, Pokémon cries, generation controls, a four-choice reveal, collectible Pokémon cursors, and a persistent Pokédex tool. Selected Pokémon replace the hunt pointer visually and never reveal the invisible Pokémon's location.

## Operating Context

The app is used in short self-guided sessions. It loads current Pokémon names, official-artwork sprite references, and game cry audio from PokéAPI's public dataset on demand. Progress and preferences stay in the browser.

## Capabilities and Constraints

- Responsive web interface with Learn, Quiz, and Pokédex views.
- Real game cry audio and official-artwork sprite references are loaded from PokéAPI's public dataset.
- Quiz questions are multiple choice and can be filtered by generation.
- Progress, streaks, favorites, and settings are stored locally.
- The interface must handle unavailable network data or audio with clear recovery actions.
- PokéAPI is community-maintained and is not an official Nintendo or The Pokémon Company API.

## Evidence on Hand

No local Pokémon media assets were supplied. The user explicitly authorized public Pokémon data sources for real cries and icons.

## Product Principles

- Sound comes before sight.
- Practice should begin in one click.
- Every answer teaches, whether correct or incorrect.
- Progress should feel encouraging, never punishing.
- The complete collection remains searchable and approachable.

## Accessibility & Inclusion

Keyboard-operable controls, visible focus states, reduced-motion support, readable contrast, and visual alternatives accompanying audio interactions.
