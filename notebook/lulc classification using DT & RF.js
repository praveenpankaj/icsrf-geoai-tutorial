// =====================
// Land Cover ML Demo (GEE)
// Labels: ESA WorldCover 2020 (10 m)
// Predictors: Sentinel-2 SR bands + indices
// Models: CART & Random Forest
// =====================

// ---------- Params ----------
var year = 2020;
// Example AOI (Delhi region). Replace with your geometry.
var aoi = ee.Geometry.Rectangle([76.5, 28.3, 77.2, 28.9]);

// Classes we’ll try to model:
// 10=Trees, 20=Shrubland, 30=Grassland, 40=Cropland, 50=Built-up,
// 60=Bare/Sparse, 80=Water, 90=Herbaceous Wetland
var targetClasses = ee.List([10, 20, 30, 40, 50, 60, 80, 90]);

// Sampling params
var perClassSamples = 500; // try 100–1000 depending on AOI size
var trainSplit = 0.7;
var seed = 42;

// ---------- Data: Labels ----------
var lulc = ee
  .Image("ESA/WorldCover/v100/" + year)
  .select("Map")
  .clip(aoi);

// Find which target classes are actually present in AOI
var hist = ee.Dictionary(
  lulc
    .reduceRegion({
      reducer: ee.Reducer.frequencyHistogram(),
      geometry: aoi,
      scale: 10,
      maxPixels: 1e10,
    })
    .get("Map")
);
var presentClasses = ee.List(hist.keys()).map(function (k) {
  return ee.Number.parse(k);
});

// Filter to target classes that exist in AOI
var classList = presentClasses
  .filter(ee.Filter.inList("item", targetClasses))
  .sort();

print("Classes present in AOI (filtered):", classList);

// ---------- Data: Predictors (Sentinel-2 SR) ----------
function addSpectralIndices(img) {
  var ndvi = img.normalizedDifference(["B8", "B4"]).rename("NDVI");
  var ndwi = img.normalizedDifference(["B3", "B8"]).rename("NDWI");
  var nbr = img.normalizedDifference(["B8", "B12"]).rename("NBR");
  return img.addBands([ndvi, ndwi, nbr]);
}

var s2 = ee
  .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
  .filterBounds(aoi)
  .filterDate(year + "-01-01", year + "-12-31")
  .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
  .median()
  .clip(aoi);

var predictorsRaw = s2.select(["B2", "B3", "B4", "B8", "B11", "B12"]);
var predictors = addSpectralIndices(predictorsRaw);

var bands = predictors.bandNames();
print("Predictor bands:", bands);

// ---------- Stratified Sampling from Labels ----------
var classPointsList = classList.map(function (c) {
  return perClassSamples;
}); // balanced per class

var stratified = lulc.stratifiedSample({
  numPoints: 0, // ignored when classPoints provided
  classBand: "Map",
  region: aoi,
  scale: 10,
  seed: seed,
  geometries: true,
  classValues: classList,
  classPoints: classPointsList,
});

// Attach predictors to samples
var samples = predictors
  .sampleRegions({
    collection: stratified,
    properties: ["Map"],
    scale: 10,
  })
  .filter(ee.Filter.notNull(bands));

// ---------- Train/Test Split ----------
var withRandom = samples.randomColumn("rand", seed);
var trainSet = withRandom.filter(ee.Filter.lt("rand", trainSplit));
var testSet = withRandom.filter(ee.Filter.gte("rand", trainSplit));

print("Train size:", trainSet.size());
print("Test size:", testSet.size());

// ---------- Models ----------
var cart = ee.Classifier.smileCart().train({
  features: trainSet,
  classProperty: "Map",
  inputProperties: bands,
});

var rf = ee.Classifier.smileRandomForest({
  numberOfTrees: 100,
  seed: seed,
}).train({
  features: trainSet,
  classProperty: "Map",
  inputProperties: bands,
});

// ---------- Evaluation: Test Set ----------
function evaluate(model, name) {
  var testClassified = testSet.classify(model);
  var cm = testClassified.errorMatrix("Map", "classification");
  print(name + " — Confusion Matrix", cm);
  print(name + " — Overall Accuracy", cm.accuracy());
  print(name + " — Kappa", cm.kappa());
  var producers = cm.producersAccuracy();
  var consumers = cm.consumersAccuracy();
  print(name + " — Producer's (per class)", producers);
  print(name + " — Consumer's (per class)", consumers);
}

evaluate(cart, "CART");
evaluate(rf, "Random Forest");

// Variable importance for RF
print("RF — Variable Importance", rf.explain());

// ---------- Apply Models to Create Maps ----------
var cartMap = predictors.classify(cart).rename("classification");
var rfMap = predictors.classify(rf).rename("classification");

// ---------- Optional: Pixel-level agreement check on a random sample ----------
var evalPts = lulc.addBands(rfMap).stratifiedSample({
  numPoints: 5000,
  classBand: "Map",
  region: aoi,
  scale: 10,
  seed: seed,
  geometries: false,
});
var cmRFvsRef = ee.ConfusionMatrix(
  evalPts.errorMatrix("Map", "classification")
);
print("RF vs Reference (random pixel sample) — Confusion Matrix", cmRFvsRef);
print("RF vs Reference — Overall Accuracy", cmRFvsRef.accuracy());
print("RF — Variable Importance", rf.explain());

// ---------- Visualization ----------
var wcPalette = [
  "006400", // 10 Trees
  "ffbb22", // 20 Shrub
  "ffff4c", // 30 Grass
  "f096ff", // 40 Crop
  "fa0000", // 50 Built-up
  "b4b4b4", // 60 Bare
  "f0f0f0", // 70 Snow
  "0064c8", // 80 Water
  "0096a0", // 90 Wetland
  "00cf75", // 95 Mangroves
  "fae6a0", // 100 Moss/Lichen
];

Map.centerObject(aoi, 10);
Map.addLayer(
  s2.select(["B4", "B3", "B2"]),
  { min: 0, max: 3000 },
  "Sentinel‑2 RGB (" + year + ")"
);
Map.addLayer(
  lulc,
  { min: 10, max: 100, palette: wcPalette },
  "ESA WorldCover " + year,
  false
);
Map.addLayer(
  cartMap,
  { min: 10, max: 100, palette: wcPalette },
  "CART Classification"
);
Map.addLayer(
  rfMap,
  { min: 10, max: 100, palette: wcPalette },
  "RF Classification",
  true
);

// ---------- Legend Helper (WorldCover subset) ----------
var classNames = ee.Dictionary({
  10: "Trees",
  20: "Shrubland",
  30: "Grassland",
  40: "Cropland",
  50: "Built-up",
  60: "Bare/Sparse",
  70: "Snow/Ice",
  80: "Water",
  90: "Herbaceous Wetland",
  95: "Mangroves",
  100: "Moss/Lichen",
});

print("Legend (code \u2192 name):", classNames);
print("Modeled classes in this run:", classList);
