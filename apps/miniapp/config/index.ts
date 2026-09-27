import path from 'node:path';
import dotenv from 'dotenv';
import { defineConfig } from '@tarojs/cli';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const globeGeoChunks = [
  'pages/globe/geo-land',
  'pages/globe/geo-country-borders-high',
  'pages/globe/geo-country-borders-medium',
  'pages/globe/geo-country-borders-low',
];

export default defineConfig({
  projectName: 'travel-guide-miniapp', designWidth: 750,
  sourceRoot: 'src', outputRoot: 'dist', framework: 'react',
  compiler: { type: 'webpack5', prebundle: { enable: false } },
  plugins: ['@tarojs/plugin-framework-react', '@tarojs/plugin-platform-weapp'],
  defineConstants: { 'process.env.TARO_APP_API_BASE_URL': JSON.stringify(process.env.TARO_APP_API_BASE_URL ?? ''),
    'process.env.TARO_APP_DEV_AUTH': JSON.stringify(process.env.TARO_APP_DEV_AUTH ?? 'false') },
  mini: {
    compile: { include: [path.resolve(__dirname, '../../../packages')] },
    addChunkPages(pages, pageNames = []) {
      if (pageNames.includes('pages/globe/index')) {
        pages.set('pages/globe/index', globeGeoChunks);
      }
    },
    webpackChain(chain) {
      const splitChunks = chain.optimization.get('splitChunks') ?? {};
      const globeDataChunk = (test: RegExp, name: string) => ({
        test,
        name: `pages/globe/${name}`,
        chunks: 'all' as const,
        enforce: true,
        priority: 100,
      });

      chain.optimization.splitChunks({
        ...splitChunks,
        cacheGroups: {
          ...splitChunks.cacheGroups,
          globeLandData: globeDataChunk(/[\\/]assets[\\/]geo[\\/]land-(?:low|high)\.json$/, 'geo-land'),
          globeCountryBordersHigh: globeDataChunk(/[\\/]assets[\\/]geo[\\/]country-borders\.json$/, 'geo-country-borders-high'),
          globeCountryBordersMedium: globeDataChunk(/[\\/]assets[\\/]geo[\\/]country-borders-medium\.json$/, 'geo-country-borders-medium'),
          globeCountryBordersLow: globeDataChunk(/[\\/]assets[\\/]geo[\\/]country-borders-low\.json$/, 'geo-country-borders-low'),
        },
      });
    },
  },
});
