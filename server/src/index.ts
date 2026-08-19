import { createApp } from './app.js';
import { config } from './lib/config.js';
import { startJobs } from './services/jobs.js';

const app = createApp();
app.listen(config.port, () => {
  console.log(`Folgo Pulse API listening on http://localhost:${config.port}`);
  startJobs();
});
