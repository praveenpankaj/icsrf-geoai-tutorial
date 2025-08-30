// --- ROI (replace with your own geometry) ---
var roi = ee.Geometry.Polygon([
  [
    [79.0, 21.0],
    [79.5, 21.0],
    [79.5, 21.5],
    [79.0, 21.5],
  ],
]);

// --- Time window ---
var startDate = ee.Date(Date.now()).advance(-2, "month"); // last 2 months
var endDate = ee.Date(Date.now());

// --- Load MODIS NDVI dataset ---
var dataset = ee
  .ImageCollection("MODIS/061/MOD13Q1")
  .select("NDVI")
  .filterBounds(roi);

// --- Current NDVI (last 2 months this year) ---
var current = dataset.filterDate(startDate, endDate).mean();

// --- Historical Baseline for same 2-month window (2003–2022) ---
var years = ee.List.sequence(2003, 2022);

var historical = ee.ImageCollection.fromImages(
  years.map(function (y) {
    var start = ee.Date.fromYMD(
      y,
      startDate.get("month"),
      startDate.get("day")
    );
    var end = ee.Date.fromYMD(y, endDate.get("month"), endDate.get("day"));
    return dataset.filterDate(start, end).mean().set("year", y);
  })
);

// Compute long-term min and max NDVI for that 2-month window
var ndviMin = historical.reduce(ee.Reducer.min());
var ndviMax = historical.reduce(ee.Reducer.max());

// --- Compute VCI for the current 2-month period ---
var vci = current
  .subtract(ndviMin)
  .divide(ndviMax.subtract(ndviMin))
  .multiply(100)
  .clip(roi);

// --- Categorize vegetation condition ---
var classified_img = vci
  .expression(
    "(vci < 20) ? 1" + " : (vci < 35) ? 2" + " : (vci < 50) ? 3" + " : 4",
    {
      vci: vci,
    }
  )
  .clip(roi);

// --- Visualization ---
var category_palette = {
  min: 1,
  max: 4,
  palette: ["#d73027", "#fc8d59", "#fee08b", "#1a9850"],
};

Map.centerObject(roi, 8);
Map.addLayer(
  classified_img,
  category_palette,
  "Vegetation Condition (Last 2 Months)"
);

// --- Print mean VCI ---
var meanVCI = vci.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: roi,
  scale: 250,
  maxPixels: 1e13,
});

print("Mean VCI for ROI (last 2 months):", meanVCI);

// --- Add Legend ---
function addLegend() {
  var legend = ui.Panel({
    style: {
      position: "bottom-left",
      padding: "8px 15px",
    },
  });

  var legendTitle = ui.Label({
    value: "Vegetation Condition (VCI)",
    style: { fontWeight: "bold", fontSize: "14px", margin: "0 0 6px 0" },
  });
  legend.add(legendTitle);

  // Colors and labels
  var colors = ["#d73027", "#fc8d59", "#fee08b", "#1a9850"];
  var names = [
    "Extreme Drought (<20)",
    "Slight/Early drought (20–35)",
    "Stressed (35–50)",
    "Healthy (>50)",
  ];

  for (var i = 0; i < colors.length; i++) {
    var colorBox = ui.Label({
      style: {
        backgroundColor: colors[i],
        padding: "8px",
        margin: "0 0 4px 0",
      },
    });
    var desc = ui.Label({
      value: names[i],
      style: { margin: "0 0 4px 6px" },
    });
    var row = ui.Panel({
      widgets: [colorBox, desc],
      layout: ui.Panel.Layout.Flow("horizontal"),
    });
    legend.add(row);
  }

  Map.add(legend);
}

addLegend();
