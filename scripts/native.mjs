// Builds the web app for the Ledgerly iOS and Android apps and hands it to Capacitor.
//
//   node scripts/native.mjs sync                       build + copy into android/ and ios/
//   node scripts/native.mjs open  android|ios          sync, then open Android Studio or Xcode
//   node scripts/native.mjs run   android|ios          sync, then run on an emulator or phone
//
// Add --production for a store build (needs --api https://...). Without it the app is a
// development build that talks to the API on this computer. Used through the `native:*` scripts
// in package.json; see "Run the mobile apps" in the README.
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeEnv, parseArgs, platformProblem, resolveApiUrl, serverIsUp } from './native-lib.mjs';

const client = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'client');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function run(args, env) {
  const res = spawnSync(npx, args, {
    cwd: client,
    stdio: 'inherit',
    env: { ...process.env, ...env },
    shell: process.platform === 'win32',
  });
  if (res.status !== 0) {
    console.error(`\nStopped: "${args.join(' ')}" did not finish.`);
    process.exit(res.status || 1);
  }
}

async function main() {
  const [command, platform, ...rest] = process.argv.slice(2);
  const wantsPlatform = command === 'open' || command === 'run';
  // `sync` has no platform word, so its options start one place earlier.
  const { production, api } = parseArgs(wantsPlatform ? rest : [platform, ...rest].filter(Boolean));

  if (!['sync', 'open', 'run'].includes(command)) {
    throw new Error('Use: sync, open android|ios, or run android|ios.');
  }
  if (wantsPlatform) {
    const problem = platformProblem(platform);
    if (problem) throw new Error(problem);
  }

  const { url, source } = resolveApiUrl({ production, api });
  const env = nativeEnv({ production, apiUrl: url });
  console.log(`\nBuilding the ${production ? 'PRODUCTION' : 'development'} app.`);
  console.log(`Server address: ${url} (from ${source})`);
  if (!production && !(await serverIsUp(url))) {
    console.log(
      '  Note: nothing answered there yet. Start the server in another terminal with: npm run dev\n',
    );
  }

  run(['vite', 'build', '--outDir', 'dist-native', '--emptyOutDir'], env);
  run(['cap', 'sync'], env);

  if (command === 'open') run(['cap', 'open', platform], env);
  if (command === 'run') run(['cap', 'run', platform], env);
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
