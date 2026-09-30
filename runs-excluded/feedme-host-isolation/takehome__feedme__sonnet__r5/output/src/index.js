#!/usr/bin/env node
'use strict';

const { runInteractive, runDemo } = require('./cli');

if (process.argv.includes('--demo')) runDemo();
else runInteractive();
