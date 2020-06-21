import util from 'util';

import concurrently from 'concurrently';
import execa, { ExecaChildProcess } from 'execa';
import npmRunPath from 'npm-run-path';
import npmWhich from 'npm-which';

import { isErrorWithCode } from './error';
import { log } from './logging';

export type Exec = (
  command: string,
  ...args: string[]
) => ExecaChildProcess<string>;

interface ExecConcurrentlyCommand {
  command: string;
  name: string;
}

type ExecOptions = execa.Options & { streamStdio?: true };

const envWithPath = {
  PATH: npmRunPath({ cwd: __dirname }),
};

const runCommand = (command: string, args: string[], opts?: ExecOptions) => {
  const subprocess = execa(command, args, {
    localDir: __dirname,
    preferLocal: true,
    stdio: 'inherit',
    ...opts,
  });

  if (opts?.streamStdio === true) {
    subprocess.stderr?.pipe(process.stderr);
    subprocess.stdout?.pipe(process.stdout);
  }

  return subprocess;
};

const whichCallback = npmWhich(__dirname);

const which = util.promisify<string, string>(whichCallback);

export const createExec = (opts: ExecOptions): Exec => (command, ...args) =>
  runCommand(command, args, opts);

export const exec: Exec = (command, ...args) => runCommand(command, args);

export const execConcurrently = (commands: ExecConcurrentlyCommand[]) => {
  const maxNameLength = commands.reduce(
    (length, command) => Math.max(length, command.name.length),
    0,
  );

  return concurrently(
    commands.map(({ command, name }) => ({
      command,
      env: envWithPath,
      name: name.padEnd(maxNameLength),
    })),
  );
};

export const ensureCommands = async (...names: string[]) => {
  let success = true;

  await Promise.all(
    names.map(async (name) => {
      try {
        return await which(name);
      } catch (err) {
        if (isErrorWithCode(err, 'ENOENT')) {
          success = false;

          return log.err(log.bold(name), 'needs to be installed.');
        }

        throw err;
      }
    }),
  );

  if (!success) {
    process.exit(1);
  }
};
