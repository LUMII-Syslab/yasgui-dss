// @ts-check


import express from 'express';
import * as path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import http from 'http';
import bodyParser from 'body-parser';

dotenv.config();
const FILENAME = fileURLToPath(import.meta.url);
const DIRNAME = path.dirname(FILENAME);

const app = express();
const PORT = process.env.PORT || 3000;
const DSS_URL = process.env.DSS_URL;

if (!DSS_URL) {
  console.error('Error: DSS_URL environment variable is not set.');
  process.exit(1);
}

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Set EJS as the view engine
app.set('view engine', 'ejs');

// Serve static files from the 'public' directory
app.use(express.static(path.join(DIRNAME, '../public')));


// Define a route to render the main page
app.get('/', (req, res) => {
  res.render('index', { dssUrl: DSS_URL });
});

app.post('/proxy', async (req, res) => {
  const targetEndpoint: string = req.body.endpoint;
  const targetMethod: string = req.body.method || 'GET';
  const targetQuery: string = req.body.query || '';
  const acceptHeader: string = req.headers['accept'] || 'application/sparql-results+json';

  if (!targetEndpoint) {
    res.status(400).json({ error: 'Missing target endpoint' });
    return;
  }

  if (targetMethod.toUpperCase() === 'GET') {
    try {
      const url = targetEndpoint + '?query=' + encodeURIComponent(targetQuery);
      const requestOptions: RequestInit = {
        method: 'GET',
        headers: {
          'Accept': acceptHeader
        }
      };
      console.log('Proxying GET request to:', url, 'with options:', requestOptions);
      const response = await fetch(url, requestOptions);
      if (!response.ok) {
        res.status(response.status).json({ error: `Endpoint returned ${response.status}` });
        return;
      }

      const contentType = response.headers.get('content-type');
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }

      res.status(response.status);
      res.send(await response.text());
    } catch (error) {
      console.error('Error proxying GET request:', error);
      res.status(500).json({ error: 'Error proxying GET request' });
    }
  } else if (targetMethod.toUpperCase() === 'POST') {
    try {
      const url = targetEndpoint;
      const requestOptions: RequestInit = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sparql-query',
          'Accept': acceptHeader
        },
        body: targetQuery
      };
      console.log('Proxying POST request to:', url, 'with options:', requestOptions);
      const response = await fetch(url, requestOptions);
      if (!response.ok) {
        res.status(response.status).json({ error: `Endpoint returned ${response.status}` });
        return;
      }

      const contentType = response.headers.get('content-type');
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }

      res.status(response.status);
      res.send(await response.text());
    } catch (error) {
      console.error('Error proxying POST request:', error);
      res.status(500).json({ error: 'Error proxying POST request' });
    }
  } else {
    res.status(400).json({ error: 'Unsupported HTTP method' });
  }

});

const httpServer = http.createServer(app);

httpServer.listen(PORT);
