# Repository instructions

## Scope and workflow

- This repository is `corvo001/corvo001.github.io`, a personal technical portfolio built with Jekyll and GitHub Pages.
- Work directly on `main`; this is the active development and deployment branch.
- Inspect the repository before implementing changes.
- Make incremental, reviewable changes and preserve existing project content where possible.
- Keep Jekyll and GitHub Pages; do not migrate frameworks unless explicitly requested.
- Prefer simple HTML, CSS, and JavaScript and avoid unnecessary dependencies.

## Design direction

- Present a technical R&D portfolio spanning software, robotics, and industrial automation.
- Use a futuristic but restrained, dark, minimal, professional visual language.
- Avoid gaming aesthetics, generic SaaS styling, excessive neon/glow, and overly rounded cards.
- Use dark graphite or near-black backgrounds, off-white primary text, cool-gray secondary text, restrained green accents, thin subtle borders, and subtle functional animation.

## Typography

- Use a Dune-like display face sparingly for `DANIEL CUERVO` and project names such as `AIDEN`, `UNION`, and `DYSON SWARM`.
- Use IBM Plex Sans for navigation, paragraphs, UI, general headings, and buttons.
- Use IBM Plex Mono for code, commands, technical metadata, and technologies where appropriate.

## Internationalization

- The site must be bilingual from the beginning.
- `/` is the language selector, `/es/` is Spanish, and `/en/` is English.
- Centralize translations and project data so additional languages can be added without duplicating the complete site.

## Homepage

- Navbar: logo, Work/Proyectos, About/Sobre mí, Contact/Contacto, and a language switcher.
- Hero: `DANIEL CUERVO` in the display typeface, a short subtitle, and generous negative space. Do not include a “View Projects” CTA or hero technology list.
- Under the hero, use a horizontal visual project showcase with scroll snap and natural horizontal scrolling/swiping, not a carousel dependency.
- Project items should support looping muted video later, reveal a project name and short information on hover, and link to the project page.
- Initially highlight AIDEN, DYSON SWARM, and UNION. Existing repository images may serve as placeholders.
- The homepage should no longer resemble stock Minimal Mistakes. Existing theme functionality may remain for internal pages initially.

## Responsive behavior

- Build responsively from the start.
- Ensure the project showcase supports natural mobile swipe.
