export const testProjects = [
  {
    test: {
      name: 'unit',
      environment: 'node',
      include: ['src/**/tests/unit/**/*.test.ts'],
    },
  },
  {
    test: {
      name: 'integration',
      environment: 'node',
      include: ['src/**/tests/integration/**/*.test.ts'],
    },
  },
  {
    test: {
      name: 'contract',
      environment: 'node',
      include: ['src/**/tests/contract/**/*.test.ts'],
    },
  },
];

export const testProjectNames = testProjects.map((project) => project.test.name);
