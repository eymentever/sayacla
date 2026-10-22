module.exports = function (api) {
  api.cache(true);
  return {
    // import.meta dönüşümü: zustand ESM derlemesi web'de "import.meta outside a module" hatası vermesin
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
  };
};
