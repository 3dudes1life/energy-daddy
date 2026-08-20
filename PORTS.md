# Local Port Map

## Energy Daddy

- `5050` — Build 1 web UI
- `5051–5099` — reserved for future Energy Daddy APIs, workers, databases, bridges, and development services

## Do not use

- `8000–8999` — reserved for Plant Daddy/local plant services. Existing Plant Daddy services include `8080` and `8090`.

Keeping each platform in its own port family prevents accidental collisions during local development.
