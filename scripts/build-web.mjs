// Сборка веб-части приложения в www/ (её Capacitor упаковывает в APK).
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

rmSync('www', { recursive: true, force: true });
mkdirSync('www');
await build({
  entryPoints: ['app/main.ts'],
  bundle: true,
  format: 'iife',
  target: ['chrome80'],
  outfile: 'www/app.js',
  minify: true,
  sourcemap: false,
  logLevel: 'info',
});
cpSync('app/index.html', 'www/index.html');
cpSync('app/style.css', 'www/style.css');
