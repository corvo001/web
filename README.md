# Daniel Cuervo — Technical Portfolio

Portfolio técnico personal centrado en software, robótica y automatización industrial.

El sitio está construido con Jekyll y se publica mediante GitHub Pages en [corvo001.github.io](https://corvo001.github.io).

## Idiomas y rutas

- `/` — entrada y selector de idioma.
- `/es/` — portfolio en español.
- `/en/` — portfolio en inglés.

Los textos globales están centralizados en `_data/translations.yml` y los proyectos en `_data/projects.yml`. Las páginas bilingües comparten layouts e includes para evitar duplicar la implementación.

## Diseño

- Identidad oscura, técnica y minimalista con adaptación automática al tema claro del dispositivo.
- Dune Rise para el nombre y los títulos de proyecto.
- IBM Plex Sans para interfaz y contenido.
- IBM Plex Mono para metadatos técnicos.
- Showcase horizontal accesible mediante flechas, teclado y gesto táctil.
- Entrada interactiva con el símbolo del portfolio y transición a través de la pupila.

## Desarrollo local en Fedora

Instala Ruby y las herramientas de compilación:

```bash
sudo dnf install ruby ruby-devel rubygem-bundler gcc-c++ make redhat-rpm-config zlib-devel
bundle install
```

Con Ruby 4, genera el sitio usando el pequeño módulo de compatibilidad incluido:

```bash
RUBYOPT=-r./_plugins/ruby-4-compat.rb bundle exec jekyll build
```

Para servir la carpeta generada:

```bash
cd _site
python3 -m http.server 4000 --bind 127.0.0.1
```

La vista previa estará disponible en `http://127.0.0.1:4000/`.

## Estructura principal

```text
_data/       Traducciones y datos de proyectos
_includes/   Navegación, footer y showcase
_layouts/    Entrada, portfolio, páginas y proyectos
assets/      Estilos, JavaScript e imágenes
es/          Rutas españolas
en/          Rutas inglesas
```

## Publicación

GitHub Pages compila y publica automáticamente cada cambio enviado a `main`.
