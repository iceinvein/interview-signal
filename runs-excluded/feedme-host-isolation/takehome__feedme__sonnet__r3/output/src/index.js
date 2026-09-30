#!/usr/bin/env node
'use strict';

const { runDemo, runInteractive } = require('./cli');

if (process.argv.includes('--demo')) {
  runDemo();
} else {
  runInteractive();
}
