import { Command } from 'commander';
import picocolors from 'picocolors';
import { describe, expect, it } from 'vitest';

import { configureCliPresentation, styleRuntimeError, styleState } from '../src/presentation.js';

const colors = picocolors.createColors(true);

describe('CLI presentation', () => {
  it('adds styled, grouped help without changing plain-text output', () => {
    const command = configureCliPresentation(
      new Command().name('reverb').description('Impact analysis'),
      colors,
    );
    command.command('doctor').helpGroup('Operations').description('check local health');

    let coloredHelp = '';
    command.configureOutput({
      getOutHasColors: () => true,
      writeOut: (value) => {
        coloredHelp += value;
      },
    });
    command.outputHelp();
    expect(coloredHelp).toContain('\u001B[36m');
    expect(coloredHelp).toContain('Operations');
    expect(coloredHelp).toContain('Examples:');

    command.configureOutput({ getOutHasColors: () => false });
    const plainHelp = command.helpInformation();
    expect(plainHelp).not.toContain('\u001B[');
    expect(plainHelp).toContain('doctor');
  });

  it('uses distinct status and runtime-error treatments', () => {
    expect(styleState('pass', colors)).toBe('\u001B[32mpass\u001B[39m');
    expect(styleState('fail', colors)).toBe('\u001B[31mfail\u001B[39m');
    expect(styleState('partial', colors)).toBe('\u001B[33mpartial\u001B[39m');
    expect(styleRuntimeError('boom', colors)).toContain('error:');
    expect(styleRuntimeError('boom', colors)).toContain('boom');
  });
});
