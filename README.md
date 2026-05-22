# Yasgui With DSS assisted autocompletion

This project demonstrates the integration of DSS client's autocompletion module with the Yasgui SPARQL editor.
The project consists of an _express_ server that serves the web app.

# Setup

1. Create a `.env` file in the root of this project using the `sample.env` file as a template. Make sure to set the `DSS_CLIENT_URL` variable to the URL where your dss-client is running (e.g., `http://localhost:3000`).

2. Build and run the project using `yarn build` and `yarn start`. This will start an Express server that serves the Yasgui editor with DSS-assisted autocompletion.
