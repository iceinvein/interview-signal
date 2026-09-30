#!/usr/bin/env node
'use strict';

const { main } = require('./cli');

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
