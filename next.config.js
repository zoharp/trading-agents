/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@std/testing/mock': false,
      '@std/testing/bdd': false,
      '@gadicc/fetch-mock-cache/runtimes/deno.ts': false,
      '@gadicc/fetch-mock-cache/stores/fs.ts': false,
    };

    // Exclude test files from yahoo-finance2
    config.module.rules.push({
      test: /yahoo-finance2\/.*\/tests\//,
      use: 'ignore-loader',
    });

    return config;
  },
};
module.exports = nextConfig;
