#!/usr/bin/env node
import { runInteractive } from './interactive.js';
import { runSimulation } from './simulation.js';

if (process.argv.includes('--simulate')) {
  await runSimulation();
} else {
  runInteractive();
}
