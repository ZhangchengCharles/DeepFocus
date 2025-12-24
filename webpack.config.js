const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'development',
  devtool: 'inline-source-map',
  entry: {
    options: './src/options.tsx',
    popup: './src/popup.tsx',
    content: './src/content.ts',
    test: './src/test.ts',
    background: {
      import: './src/background.ts',
      // Use import-scripts for service worker chunk loading (required for transformers.js)
      chunkLoading: 'import-scripts',
    }
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    chunkFilename: '[name].js',
    publicPath: '/dist/',
    clean: true
  },
  experiments: {
    // Enable async WebAssembly
    asyncWebAssembly: true,
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: [/node_modules/, /\.test\.ts$/, /\.spec\.ts$/]
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader']
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/options.html',
      filename: 'options.html',
      chunks: ['options']
    }),
    new HtmlWebpackPlugin({
      template: './src/popup.html',
      filename: 'popup.html',
      chunks: ['popup']
    }),
    new HtmlWebpackPlugin({
      template: './src/test.html',
      filename: 'test.html',
      chunks: ['test']
    }),
    // Copy WASM files from onnxruntime-web for service worker loading
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'node_modules/onnxruntime-web/dist/*.wasm',
          to: '[name][ext]'
        }
      ]
    })
    // Models are downloaded by transformers.js automatically, no need to copy
  ]
}; 