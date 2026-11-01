require('dotenv').config({ quiet: true });

const path = require('path');
const { createApp } = require('./app');

const PORT = Number(process.env.PORT) || 3000;
// Local only by default. Set HOST=0.0.0.0 to control the show from a phone on your network.
const HOST = process.env.HOST || '127.0.0.1';
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

const { server, tokens, start, close } = createApp({ dataDir });

server.listen(PORT, HOST, () => {
  const base = `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`;
  console.log(`\nInPlay Studio is running.\n`);
  console.log(`  Control room:  ${base}/control/#token=${tokens.control}`);
  console.log(`  OBS sources are listed in the control room, under "Add to OBS".\n`);
  start();
});

function shutdown() {
  close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
