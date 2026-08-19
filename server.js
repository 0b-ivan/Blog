const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 8080;
const root = __dirname;

app.use('/assets', express.static(path.join(root, 'assets')));
app.use(express.static(root, { extensions: ['html'] }));

app.get('/healthz', (_req, res) => {
  res.status(200).send('ok');
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(root, 'index.html'));
});

app.listen(port, () => {
  console.log(`kernel-notes listening on :${port}`);
});
