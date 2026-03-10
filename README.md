# Yasgui With DSS assisted autocompletion

This project demonstrates the integration of DSS client's autocompletion module with the Yasgui SPARQL editor.

# Setup

1. Clone [this repository](https://github.com/LUMII-Syslab/yasgui-dss) and the [dss-client](https://github.com/LUMII-Syslab/dss-client) into the same parent directory. (This is done because the dss-client is linked as a local dependency in the package.json of this project while dss-client is still unpublished.)

2. Set up the dss-client by following the instructions in its README.

3. Install dependencies for this project by running `yarn install` in the root of this project.

4. Create a `.env` file in the root of this project using the `sample.env` file as a template. Make sure to set the `DSS_CLIENT_URL` variable to the URL where your dss-client is running (e.g., `http://localhost:3000`).

5. Build and run the project using `yarn build` and `yarn start`. This will start an Express server that serves the Yasgui editor with DSS-assisted autocompletion.