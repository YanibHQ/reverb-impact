import type { Command } from 'commander';
import picocolors from 'picocolors';

type ColorPalette = ReturnType<typeof picocolors.createColors>;

const HELP_EXAMPLES = [
  ['Create a workspace', 'reverb init .'],
  ['Index a repository', 'reverb index --repo api --ref HEAD'],
  ['Preview an impact', 'reverb analyze --repo api --base main --head HEAD'],
  ['Check local health', 'reverb doctor'],
] as const;

export function configureCliPresentation(
  command: Command,
  colors: ColorPalette = picocolors,
): Command {
  command.configureHelp({
    sortOptions: true,
    styleArgumentText: (value) => colors.magenta(value),
    styleCommandText: (value) => colors.bold(value),
    styleDescriptionText: (value) => colors.dim(value),
    styleOptionText: (value) => colors.yellow(value),
    styleSubcommandText: (value) => colors.cyan(value),
    styleTitle: (value) => colors.bold(colors.cyan(value)),
  });
  command.configureOutput({
    outputError: (value, write) => write(colors.red(value)),
  });
  command.addHelpText('after', () => {
    const examples = HELP_EXAMPLES.map(
      ([description, invocation]) =>
        `  ${colors.dim(description.padEnd(23))} ${colors.cyan(invocation)}`,
    ).join('\n');
    return `\n${colors.bold(colors.cyan('Examples:'))}\n${examples}\n`;
  });
  return command;
}

export function styleState(state: string, colors: ColorPalette = picocolors): string {
  switch (state) {
    case 'complete':
    case 'pass':
    case 'selected':
      return colors.green(state);
    case 'fail':
    case 'failed':
      return colors.red(state);
    case 'partial':
    case 'preview':
    case 'unknown':
      return colors.yellow(state);
    default:
      return colors.cyan(state);
  }
}

export function styleRuntimeError(message: string, colors: ColorPalette = picocolors): string {
  return `${colors.bold(colors.red('error:'))} ${message}`;
}
