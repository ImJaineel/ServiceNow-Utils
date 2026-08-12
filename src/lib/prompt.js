import { createInterface } from 'node:readline/promises';

/**
 * Resolves the ServiceNow instance name to use for a command.
 * If one was already supplied (e.g. via -i/--instance), it's used as-is.
 * Otherwise, prompts the user for it interactively.
 *
 * @param {string} [provided] - Instance name already supplied via a flag
 * @returns {Promise<string>}
 */
export async function resolveInstance(provided) {
  if (provided) return provided.trim();

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const instance = (await rl.question('ServiceNow instance (e.g. flexdev): ')).trim();
    if (!instance) throw new Error('An instance is required.');
    return instance;
  } finally {
    rl.close();
  }
}
