import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'blocks/index': 'src/blocks/index.ts',
    'blocks/email-mjml/index': 'src/blocks/email-mjml/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  splitting: false,
  treeshake: true,
  external: ['zod'],
});
