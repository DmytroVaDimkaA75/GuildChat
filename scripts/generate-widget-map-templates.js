const fs = require("node:fs");
const path = require("node:path");
const babel = require("@babel/core");

const projectRoot = path.resolve(path.dirname(require.main.filename), "..");
const moduleCache = new Map();

const loadProjectModule = (filePath) => {
  const absolutePath = path.resolve(filePath);
  const cached = moduleCache.get(absolutePath);
  if (cached) return cached.exports;

  const moduleRecord = { exports: {} };
  moduleCache.set(absolutePath, moduleRecord);

  const source = fs.readFileSync(absolutePath, "utf8");
  const transformed = babel.transformSync(source, {
    filename: absolutePath,
    plugins: ["@babel/plugin-transform-modules-commonjs"],
    babelrc: false,
    configFile: false,
  }).code;

  const localRequire = (request) => {
    if (!request.startsWith(".")) return require(request);
    const resolved = path.resolve(
      path.dirname(absolutePath),
      request.endsWith(".js") ? request : `${request}.js`
    );
    return loadProjectModule(resolved);
  };

  const evaluate = new Function(
    "require",
    "module",
    "exports",
    transformed
  );
  evaluate(localRequire, moduleRecord, moduleRecord.exports);
  return moduleRecord.exports;
};

const { buildGbgMapSvgStringFromState, getMapData } = loadProjectModule(
  path.join(projectRoot, "components/GBG/gbgSvgBuilder.js")
);
const outputDirectory = path.join(
  projectRoot,
  "android/app/src/main/res/raw"
);
fs.mkdirSync(outputDirectory, { recursive: true });

[
  ["volcanic_archipelago", "gbg_map_volcanic.svg"],
  ["waterfall_archipelago", "gbg_map_waterfall.svg"],
].forEach(([mapKey, fileName]) => {
  const svg = buildGbgMapSvgStringFromState({
    mapKey,
    sectorColors: {},
    sectorStaff: {},
  });

  Object.entries(getMapData(mapKey)).forEach(([sectorId, config]) => {
    const expectedIds = [
      config?.fill?.d ? `f${sectorId}` : null,
      config?.text?.d ? `t${sectorId}` : null,
      config?.icon?.d ? `i${sectorId}` : null,
    ].filter(Boolean);

    expectedIds.forEach((expectedId) => {
      const needle = `id="${expectedId}"`;
      const matchesCount = svg.split(needle).length - 1;
      if (matchesCount !== 1) {
        throw new Error(
          `${mapKey}: expected exactly one SVG element with id="${expectedId}"`
        );
      }
    });
  });

  fs.writeFileSync(path.join(outputDirectory, fileName), svg, "utf8");
});
