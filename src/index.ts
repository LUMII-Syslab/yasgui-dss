// @ts-check


import express from 'express';
import * as path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DSS_URL = process.env.DSS_URL;

if (!DSS_URL) {
  console.error('Error: DSS_URL environment variable is not set.');
  process.exit(1);
}

// Set EJS as the view engine
app.set('view engine', 'ejs');

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, '../public')));


// Define a route to render the main page
app.get('/', (req, res) => {
  res.render('index', { dssUrl: DSS_URL });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
