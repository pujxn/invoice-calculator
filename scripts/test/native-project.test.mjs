// Checks of the committed iOS and Android projects and the Capacitor settings. They cannot prove
// the apps build (that needs Xcode and Android Studio) but they catch the mistakes that would
// quietly break them or weaken their security.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const client = resolve(root, 'client');
const read = (...p) => readFileSync(resolve(client, ...p), 'utf8');

// Loads capacitor.config.ts the way the Capacitor CLI does: transpile, then evaluate.
async function loadConfig(nativeEnv) {
  const source = read('capacitor.config.ts');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const before = process.env.LEDGERLY_NATIVE_ENV;
  if (nativeEnv === undefined) delete process.env.LEDGERLY_NATIVE_ENV;
  else process.env.LEDGERLY_NATIVE_ENV = nativeEnv;
  try {
    const mod = await import(
      `data:text/javascript;base64,${Buffer.from(js).toString('base64')}#${Math.random()}`
    );
    return mod.default;
  } finally {
    if (before === undefined) delete process.env.LEDGERLY_NATIVE_ENV;
    else process.env.LEDGERLY_NATIVE_ENV = before;
  }
}

test('Capacitor config: name, id and web folder', async () => {
  const config = await loadConfig();
  assert.equal(config.appName, 'Ledgerly');
  assert.match(config.appId, /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/);
  assert.equal(config.webDir, 'dist-native');
  // The Android origin must stay https://localhost: changing it signs everyone out.
  assert.equal(config.server.androidScheme, 'https');
});

test('Capacitor config: http is never allowed unless the build asked for development', async () => {
  for (const env of [undefined, '', 'production', 'staging', 'DEVELOPMENT']) {
    const config = await loadConfig(env);
    assert.equal(config.android.allowMixedContent, false, `env=${env}`);
    assert.equal(config.server.cleartext, undefined, `env=${env}`);
  }
  const dev = await loadConfig('development');
  assert.equal(dev.android.allowMixedContent, true);
  assert.equal(dev.server.cleartext, true);
  // Never a live-reload address baked into the config.
  assert.equal(dev.server.url, undefined);
});

test('the app id is the same in the Capacitor config, Android and iOS projects', async () => {
  const { appId } = await loadConfig();
  assert.match(read('android/app/build.gradle'), new RegExp(`applicationId "${appId}"`));
  assert.match(read('android/app/build.gradle'), new RegExp(`namespace "${appId}"`));
  assert.match(
    read('ios/App/App.xcodeproj/project.pbxproj'),
    new RegExp(`PRODUCT_BUNDLE_IDENTIFIER = ${appId};`),
  );
  assert.ok(
    existsSync(
      resolve(client, 'android/app/src/main/java', ...appId.split('.'), 'MainActivity.java'),
    ),
  );
});

test('Android: https only in release builds, plain http only in the debug overlay', () => {
  const main = read('android/app/src/main/AndroidManifest.xml');
  const debug = read('android/app/src/debug/AndroidManifest.xml');
  assert.match(main, /android\.permission\.INTERNET/);
  assert.doesNotMatch(main, /usesCleartextTraffic/);
  assert.match(debug, /android:usesCleartextTraffic="true"/);
  // No broad storage or camera permissions: the system camera and photo picker need none.
  assert.doesNotMatch(
    main,
    /READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|android\.permission\.CAMERA/,
  );
  // The sign-in token must not be copied into phone backups.
  assert.match(main, /android:allowBackup="false"/);
});

test('iOS: camera and photo explanations, and http only for the local network', () => {
  const plist = read('ios/App/App/Info.plist');
  for (const key of [
    'NSCameraUsageDescription',
    'NSPhotoLibraryUsageDescription',
    'NSPhotoLibraryAddUsageDescription',
  ]) {
    const m = new RegExp(`<key>${key}</key>\\s*<string>([^<]{20,})</string>`).exec(plist);
    assert.ok(m, `${key} needs a sentence the person will read`);
  }
  assert.match(plist, /<key>NSAllowsLocalNetworking<\/key>\s*<true\/>/);
  assert.doesNotMatch(plist, /NSAllowsArbitraryLoads/);
});

test('iOS: every Capacitor plugin the app uses is wired into the Swift package', () => {
  const pkg = read('ios/App/CapApp-SPM/Package.swift');
  for (const name of [
    'CapacitorCamera',
    'CapacitorStatusBar',
    'CapacitorSplashScreen',
    'CapacitorKeyboard',
  ]) {
    assert.match(pkg, new RegExp(`product\\(name: "${name}"`));
  }
});

test('the plugins in package.json are the ones the code imports', () => {
  const deps = JSON.parse(read('package.json')).dependencies;
  for (const name of [
    '@capacitor/core',
    '@capacitor/camera',
    '@capacitor/status-bar',
    '@capacitor/splash-screen',
    '@capacitor/keyboard',
    '@capacitor/android',
    '@capacitor/ios',
  ]) {
    assert.ok(deps[name], `${name} is a dependency`);
  }
  // All Capacitor packages share one major version.
  const majors = new Set(
    Object.entries(deps)
      .filter(([k]) => k.startsWith('@capacitor/'))
      .map(([, v]) => v.replace(/^[^\d]*/, '').split('.')[0]),
  );
  assert.equal(majors.size, 1, `mixed Capacitor versions: ${[...majors]}`);
});

test('icons and splash screens are in both projects', () => {
  for (const file of [
    'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png',
    'ios/App/App/Assets.xcassets/Splash.imageset/Default@2x~universal~anyany.png',
    'ios/App/App/Assets.xcassets/Splash.imageset/Default@2x~universal~anyany-dark.png',
    'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png',
    'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png',
    'android/app/src/main/res/drawable/splash.png',
    'android/app/src/main/res/drawable-night/splash.png',
  ]) {
    assert.ok(existsSync(resolve(client, file)), `${file} is missing; run npm run native:assets`);
  }
});

test('git keeps native sources but not build output or generated copies', () => {
  const tracked = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', 'client'],
    { cwd: root, encoding: 'utf8' },
  );
  assert.match(tracked, /client\/android\/app\/build\.gradle/);
  assert.match(tracked, /client\/ios\/App\/App\/Info\.plist/);
  assert.match(tracked, /client\/capacitor\.config\.ts/);
  for (const bad of [
    /dist-native\//,
    /android\/app\/build\//,
    /android\/\.gradle\//,
    /android\/app\/src\/main\/assets\/public\//,
    /android\/app\/src\/main\/assets\/capacitor\.config\.json/,
    /ios\/App\/App\/public\//,
    /ios\/App\/App\/capacitor\.config\.json/,
    /ios\/App\/Pods\//,
    /DerivedData/,
    /local\.properties/,
  ]) {
    assert.doesNotMatch(tracked, bad);
  }
});

test('the npm scripts for the apps exist', () => {
  const scripts = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).scripts;
  for (const name of [
    'native:sync',
    'native:sync:production',
    'native:android',
    'native:ios',
    'native:run:android',
    'native:run:ios',
    'native:assets',
    'test:scripts',
  ]) {
    assert.ok(scripts[name], `npm run ${name}`);
  }
  assert.match(scripts.test, /test:scripts/);
});
