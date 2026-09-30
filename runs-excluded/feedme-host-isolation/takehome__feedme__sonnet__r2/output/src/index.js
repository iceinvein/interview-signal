#!/usr/bin/env node
'use strict';

const { runInteractive } = require('./cli');
const { runDemo } = require('./demo');

// Usage: node src/index.js [--demo] [--output <file>] [--processing-ms <ms>]
function parseArgs(argv) {
  const args = { demo: false, output: undefined, processingMs: undefined };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--demo') args.demo = true;
    else if (argv[i] === '--output') args.output = argv[++i];
    else if (argv[i] === '--processing-ms') args.processingMs = Number(argv[++i]);
  }
  return args;
}

const { demo, output, processingMs } = parseArgs(process.argv.slice(2));

if (demo) {
  runDemo({ outputPath: output, processingMs }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  runInteractive({ processingMs });
}
