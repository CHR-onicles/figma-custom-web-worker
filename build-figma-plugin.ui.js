module.exports = function (buildOptions) {
  return {
    ...buildOptions,
    define: {
      global: 'window',
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
    }
  }
}
