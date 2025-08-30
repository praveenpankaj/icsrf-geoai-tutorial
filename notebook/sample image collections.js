/***********************
 * 0) BASIC SETUP
 ***********************/
var startDate = "2024-07-01";
var endDate = "2024-07-31";

// Mawsynram, Meghalaya (approx). Use a small buffer for area stats.
var mawsynram = ee.Geometry.Point([91.582, 25.298]);
var roi = mawsynram.buffer(2500); // ~2.5 km radius

Map.centerObject(roi, 10);
Map.addLayer(roi, { color: "red" }, "ROI (Mawsynram buffer)");

/***********************************************
 * 1) SENTINEL-2 SR HARMONIZED: median/max/min/mosaic
 ***********************************************/

// Cloud mask using QA60 (basic & beginner friendly)
function maskS2sr(img) {
  var qa = img.select("QA60");
  var cloudBitMask = 1 << 10; // clouds
  var cirrusBitMask = 1 << 11; // cirrus
  var mask = qa
    .bitwiseAnd(cloudBitMask)
    .eq(0)
    .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
  return img
    .updateMask(mask)
    .divide(10000) // scale reflectance to [0,1]
    .copyProperties(img, img.propertyNames());
}

var s2 = ee
  .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
  .filterBounds(roi)
  .filterDate(startDate, endDate)
  .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 60))
  .map(maskS2sr);

// Compose stats
var s2Median = s2.median();
var s2Min = s2.min();
var s2Max = s2.max();
var s2Mosaic = s2.mosaic(); // last-on-top mosaic in collection ordering

// True-color visualization
var visTrue = { bands: ["B4", "B3", "B2"], min: 0.02, max: 0.3 };

// Add to map (toggle layers)
Map.addLayer(s2Median.clip(roi), visTrue, "S2 Median (True color)");
Map.addLayer(s2Max.clip(roi), visTrue, "S2 Max (True color)", false);
Map.addLayer(s2Min.clip(roi), visTrue, "S2 Min (True color)", false);
Map.addLayer(s2Mosaic.clip(roi), visTrue, "S2 Mosaic (True color)", false);

/***********************************************
 * 2) CHIRPS Daily Rainfall (mm): date-wise for a month
 ***********************************************/
// CHIRPS daily precipitation (mm/day)
var chirps = ee
  .ImageCollection("UCSB-CHG/CHIRPS/DAILY")
  .filterBounds(roi)
  .filterDate(startDate, endDate)
  .select("precipitation");

// Chart: daily rainfall trend (mean over ROI)
var chirpsChart = ui.Chart.image
  .series({
    imageCollection: chirps,
    region: roi,
    reducer: ee.Reducer.mean(),
    scale: 5000, // CHIRPS ~0.05 deg (~5.5 km)
    xProperty: "system:time_start",
  })
  .setOptions({
    title:
      "CHIRPS Daily Rainfall (mm) - Mawsynram (" +
      startDate +
      " to " +
      endDate +
      ")",
    hAxis: { title: "Date" },
    vAxis: { title: "Rainfall (mm)" },
    lineWidth: 2,
    pointSize: 3,
  });

print(chirpsChart);

// Convert images to features (date + value)
var chirpsAsFeatures = chirps.map(function (img) {
  var meanmm = img
    .reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: roi,
      scale: 5000,
      maxPixels: 1e13,
    })
    .get("precipitation");

  return ee.Feature(null, {
    date: ee.Date(img.get("system:time_start")).format("YYYY-MM-dd"),
    rainfall_mm: meanmm,
  });
});

// Sort by date and print
chirpsAsFeatures = chirpsAsFeatures.sort("date");
print("CHIRPS daily rainfall table (mm):", chirpsAsFeatures);

/***********************************************
 * 3) ERA5-Land 2m Air Temperature: trendline in a month
 ***********************************************/
// ERA5-Land hourly, variable: temperature_2m (K)
var era5 = ee
  .ImageCollection("ECMWF/ERA5_LAND/HOURLY")
  .filterBounds(roi)
  .filterDate(startDate, endDate)
  .select("temperature_2m");

// Convert Kelvin to Celsius for each image
var era5C = era5.map(function (img) {
  var c = img.subtract(273.15).rename("t2m_c");
  return c.copyProperties(img, img.propertyNames());
});

// Chart hourly temperature (C) over the month (mean over ROI)
var tChart = ui.Chart.image
  .series({
    imageCollection: era5C,
    region: roi,
    reducer: ee.Reducer.mean(),
    scale: 10000, // ERA5-Land ~9 km
    xProperty: "system:time_start",
  })
  .setOptions({
    title:
      "ERA5-Land 2m Temperature (°C) - Hourly Trend (" +
      startDate +
      " to " +
      endDate +
      ")",
    hAxis: { title: "Date/Time" },
    vAxis: { title: "Temperature (°C)" },
    lineWidth: 2,
    pointSize: 0,
  });

print(tChart);

// Aggregate to daily mean temperature for a cleaner daily trendline
// Build daily dates
var start = ee.Date(startDate);
var end = ee.Date(endDate);
var nDays = end.difference(start, "day");
var dates = ee.List.sequence(0, nDays.subtract(1)).map(function (d) {
  return start.advance(ee.Number(d), "day");
});

// Map over dates to compute daily mean temp (°C) image
var dailyMeanT = ee.ImageCollection.fromImages(
  dates.map(function (d) {
    d = ee.Date(d);
    var dayEnd = d.advance(1, "day");
    var dayColl = era5C.filterDate(d, dayEnd);
    var dayMean = dayColl
      .mean()
      .set("date", d.format("YYYY-MM-dd"))
      .set("system:time_start", d.millis());
    return dayMean;
  })
);

// Chart daily mean °C
var dailyChart = ui.Chart.image
  .series({
    imageCollection: dailyMeanT,
    region: roi,
    reducer: ee.Reducer.mean(),
    scale: 10000,
    xProperty: "system:time_start",
  })
  .setOptions({
    title:
      "ERA5-Land 2m Temperature (°C) - Daily Mean (" +
      startDate +
      " to " +
      endDate +
      ")",
    hAxis: { title: "Date" },
    vAxis: { title: "Temperature (°C)" },
    lineWidth: 3,
    pointSize: 5,
  });

print(dailyChart);

/***********************************************
 * Map layer for CHIRPS monthly total
 ***********************************************/
var chirpsMonthTotal = chirps.sum().rename("monthly_total_mm");
Map.addLayer(
  chirpsMonthTotal.clip(roi),
  { min: 0, max: 1500, palette: ["white", "cyan", "blue", "purple"] },
  "CHIRPS Monthly Total (mm)",
  false
);
