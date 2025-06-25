import typescript from 'rollup-plugin-typescript2';

export default {
  input: 'main.ts',
  output: {
    dir: 'dist',
    format: 'cjs',
    exports: 'default',
  },
  external: ['obsidian'],
  plugins: [typescript()],
};
