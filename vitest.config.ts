import { defineConfig } from 'vitest/config';
import { testProjects } from './test-topology.js';

export default defineConfig({
  test: {
    projects: testProjects,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
