var cameramap, travelflowsmap;
var cameras, geometries, latitudes, longitudes, obsWithFeatureOfInterest, obsWithPropertyPassedByVehiclesCount, obsCounts, dailyObs, hourlyObs, obsWithPropertyPassedByVehiclesCountMedian;
var obsWithPropertyPassedByVehiclesInFlow;

var travelflows, featurecollectionTravelflows, mustPlay;
var flowsInfo = L.control();
var flowsLegend = L.control({position: 'bottomright'});

var cameraLayers, layerLastClicked;
var cameraInfo = L.control();

const wkt = require('../node_modules/wellknown/wellknown.js');
const Plotly = require('../node_modules/plotly.js/dist/plotly.js');
const N3 = require('n3');
const { DataFactory } = N3;
const { namedNode, literal, defaultGraph, quad } = DataFactory;

const parser = new N3.Parser();
const store = new N3.Store();

window.onload = function(){
	prepareCameraMap();
	prepareTravelflowsMap();
  	storeData();
};

function prepareTravelflowsMap() {
	travelflowsmap = L.map('travelFlowsMap').setView([50.838, 3.2623], 12);

	 L.tileLayer('https://api.mapbox.com/styles/v1/mapbox/light-v10/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoibWF4aW10bWFydGluIiwiYSI6ImNqcHdqbjdhaDAzYzc0Mm04eDFhamkzenMifQ.0uNbKJ2WHATkKBBSADuhyQ', {
		maxZoom: 20,
		attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, ' +
			'<a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' +
			'Imagery © <a href="https://www.mapbox.com/">Mapbox</a>'
	}).addTo(travelflowsmap)

	flowsInfo.onAdd = function (map) {
	    this._div = L.DomUtil.create('div', 'flowsInfo'); // create a div with a class "info"
	    this.update();
	    return this._div;
	};

	// method that we will use to update the control based on feature properties passed
	flowsInfo.update = function (feature) {
		if (feature) {
			let flowsOpposite;
			for (let f in featurecollectionTravelflows.features) {
				// search for opposite direction
				if (featurecollectionTravelflows.features[f].properties.origin === feature.properties.destination && featurecollectionTravelflows.features[f].properties.destination === feature.properties.origin)
					flowsOpposite = featurecollectionTravelflows.features[f].properties.flows;
			}
		    this._div.innerHTML = (feature.properties ?
		        'Van <b>' + feature.properties.originLabel + '</b> naar <b>' + feature.properties.destinationLabel + '</b>: ' + feature.properties.flows + ' voertuigen' +
		        (flowsOpposite ? '. In omgekeerde richting zijn er ' + flowsOpposite + ' voertuigen gedetecteerd.' : '')
		        : '<h4>Aantal voertuigen gedetecteerd tussen 2 camera\'s</h4>Klik op een flow voor meer details.');
		} else {
			this._div.innerHTML = '<h4>Aantal voertuigen gedetecteerd tussen 2 camera\'s</h4>' +
		        'Klik op een flow voor meer details of verschuif de tijdsbalk.';
		}
	};
	flowsInfo.addTo(travelflowsmap);

	flowsLegend.onAdd = function (map) {
	    var div = L.DomUtil.create('div', 'flowsLegend'),
	        grades = [0, 20, 40, 60, 80, 100, 120, 140, 160],
	        labels = [];

	    // loop through our density intervals and generate a label with a colored square for each interval
	    for (var i = 0; i < grades.length; i++) {
	        div.innerHTML +=
	            '<i style="background:' + getColor(grades[i] + 1) + '"></i> ' +
	            grades[i] + (grades[i + 1] ? '&ndash;' + grades[i + 1] + '<br>' : '+');
	    }
	    return div;
	};

	flowsLegend.addTo(travelflowsmap);
}

function prepareCameraMap() {
	cameramap = L.map('cameramap',{ maxZoom: 16 }).setView([50.838, 3.2623], 12);
	 L.tileLayer('https://api.mapbox.com/styles/v1/mapbox/light-v10/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoibWF4aW10bWFydGluIiwiYSI6ImNqcHdqbjdhaDAzYzc0Mm04eDFhamkzenMifQ.0uNbKJ2WHATkKBBSADuhyQ', {
		maxZoom: 20,
		attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, ' +
			'<a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' +
			'Imagery © <a href="https://www.mapbox.com/">Mapbox</a>'
	}).addTo(cameramap);

	cameraInfo.onAdd = function (map) {
	    this._div = L.DomUtil.create('div', 'cameraInfo'); // create a div with a class "info"
	    this.update();
	    return this._div;
	};

	// method that we will use to update the control based on feature properties passed
	cameraInfo.update = function (feature) {
		    this._div.innerHTML = (feature ? '<b>' + feature.properties.name + '</b>'
		        : '<h4>Klik op een camera voor meer details.</h4>');
	};
	cameraInfo.addTo(cameramap);
}

function storeData() {
	parser.parse(window.data, (error, quad, prefixes) => {
    if (quad) {
      store.addQuad(quad);
    }
    else {
    	// First some extra data preparation
		cameras = store.getQuads(null, namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"), namedNode("https://wegenenverkeer.data.vlaanderen.be/ns/onderdeel#ANPRCamera"));
		geometries = unpackObjects(unpackSubjectsOfQuads(cameras, namedNode('http://www.w3.org/ns/locn#geometry')), namedNode('http://www.opengis.net/ont/geosparql#asWKT'));
		latitudes = getLatitudeArrayFromObjects(geometries);
		longitudes = getLongitudeArrayFromObjects(geometries);

		obsWithPropertyPassedByVehiclesInFlowCount = getSubjectsArray(store.getQuads(null, namedNode('http://www.w3.org/ns/sosa/observedProperty'), namedNode('https://w3id.org/cityofthings#passedByVehiclesInFlowCount')));
		obsWithPropertyPassedByVehiclesCount = getSubjectsArray(store.getQuads(null, namedNode('http://www.w3.org/ns/sosa/observedProperty'), namedNode('https://w3id.org/cityofthings#passedByVehiclesCount'))).sort(sortSubjectsByBeginning);
		dailyObs = getSubjectsArray(store.getQuads(null, namedNode('https://w3id.org/cityofthings#aggregationPeriod'), namedNode('https://w3id.org/cityofthings#Daily')));
		hourlyObs = getSubjectsArray(store.getQuads(null, namedNode('https://w3id.org/cityofthings#aggregationPeriod'), namedNode('https://w3id.org/cityofthings#Hourly')));

		obsWithPropertyPassedByVehiclesCountMedian = getSubjectsArray(store.getQuads(null, namedNode('http://www.w3.org/ns/sosa/observedProperty'), namedNode('https://w3id.org/cityofthings#passedByVehiclesCountMedian')));

		// Hide loader
	  	document.getElementById("loader").style.display = "none";
	  	document.getElementById("loader-text").style.display = "none";
  		document.getElementById("playButton").style.display = "initial";

		showDates();
		showCameras();

		loadOverzichtTransitEnUniekGraph();
  	}
  });
}

function showDates() {
	// retrieve start and end phenomenontime
	let start = new Date(getBeginningFromSubject(hourlyObs[0]));
	let end = new Date(getBeginningFromSubject(hourlyObs[hourlyObs.length-1]));
	let startMonth = start.getMonth()+1;
	let endMonth = end.getMonth()+1;

	// Update title
	document.getElementById('titel').innerHTML = "Rapport ANPR van " 
											+ start.getFullYear() 
											+ "-" + startMonth
											+ "-" + start.getDate()
											+ " tot "
											+ end.getFullYear() 
											+ "-" + endMonth
											+ "-" + end.getDate();

	// Update slider for travelflows
	$( "#slider" ).slider({
	      value: start.getTime(),
	      min: start.getTime(),
	      max: end.getTime(),
	      step: 1000*60*60, // hourly
	      slide: function (event, ui) {
			// Translate value (unix milliseconds) to timestamp
	        $( "#amount" ).val(formatDate(new Date(ui.value)));
	      },
	      stop: function( event, ui ) {
	        // Update heatmap
	        updateAmountAndHeatmapWithSliderValue();
	      }
	});
	updateAmountAndHeatmapWithSliderValue();    
	$("#playButton").click(configurePlayButton);
}

function formatDate(date) {
	let dayOfWeek = date.getDay();
	let dagVanWeek = '';

	if (dayOfWeek === 0) {
		dagVanWeek = "Zondag";
	} else if (dayOfWeek === 1) {
		dagVanWeek = "Maandag";
	} else if (dayOfWeek === 2) {
		dagVanWeek = "Dinsdag";
	} else if (dayOfWeek === 3) {
		dagVanWeek = "Woensdag";
	} else if (dayOfWeek === 4) {
		dagVanWeek = "Donderdag";
	} else if (dayOfWeek === 5) {
		dagVanWeek = "Vrijdag";
	} else if (dayOfWeek === 6) {
		dagVanWeek = "Zaterdag";
	}

	let month = date.getMonth();
	let maand = '';

	if (month === 0) {
		maand = 'januari';
	} else if (month === 1) {
		maand = 'februari';
	} else if (month === 2) {
		maand = 'maart';
	} else if (month === 3) {
		maand = 'april';
	} else if (month === 4) {
		maand = 'mei';
	} else if (month === 5) {
		maand = 'juni';
	} else if (month === 6) {
		maand = 'juli';
	} else if (month === 7) {
		maand = 'augustus';
	} else if (month === 8) {
		maand = 'september';
	} else if (month === 9) {
		maand = 'oktober';
	} else if (month === 10) {
		maand = 'november';
	} else if (month === 11) {
		maand = 'december';
	}

	return dagVanWeek + ' ' + date.getDate() + ' ' + maand + ' ' + date.getFullYear() + ' om ' + date.getHours() + ' uur';
}

function updateAmountAndHeatmapWithSliderValue() {
		let value = new Date($( "#slider" ).slider( "value" ));
		$( "#amount" ).val(formatDate(value));
		plotHeatmapPerHour(value);
}
function configurePlayButton() {
	mustPlay = $("#playButton").html().trim() === '<span class="round-button"><i class="fa fa-play fa-2x"></i></span>';
	$("#playButton").html(
	     mustPlay ? 
	     '<span class="round-button" style="padding-left: 0 !important"><i class="fa fa-pause fa-2x"></i></span>' : '<span class="round-button"><i class="fa fa-play fa-2x"></i></span>');

	if (mustPlay) updateAmountAndHeatmapWithSliderValueContinuously();
}

function updateAmountAndHeatmapWithSliderValueContinuously() {
	if (mustPlay) {
		let currentValue = $( "#slider" ).slider( "value");
		$( "#slider" ).slider( "value", currentValue + 1000*60*60); // add hour 
		let value = new Date($( "#slider" ).slider( "value" ));
		$( "#amount" ).val(formatDate(value)); // update input field
		plotHeatmapPerHour(value);
		setTimeout(updateAmountAndHeatmapWithSliderValueContinuously, 100);
	}
}

function showCameras() {
	for (let c in cameras) {
		let latlng = [longitudes[getSubjectsArray(cameras).indexOf(cameras[c].subject.value)], latitudes[getSubjectsArray(cameras).indexOf(cameras[c].subject.value)]];
		let feature = {
			"type": "Feature",
		    "properties": {
		        "name": store.getQuads(cameras[c].subject, "http://www.w3.org/2000/01/rdf-schema#label", null)[0].object.value,
		        "id": cameras[c].subject.value,
		        "longitude": latlng[0],
		        "latitude": latlng[1],
		        "radius": 50
		    },
		    "geometry": {
		    	"type":"Point",
		    	"coordinates": latlng
		    }
		};
		L.geoJSON(feature, {
    		"pointToLayer": (feature, latlng) => {
		        if (feature.properties.radius) {
		          return new L.Circle(latlng, feature.properties.radius);
		        } else {
		          return new L.Marker(latlng);
		        }
      		},
      		"onEachFeature": cameraOnEachFeature,
      		"style": cameraStyle
      	}).addTo(cameramap);
	}
}

function cameraStyle(feature) {
    return {
        weight: 2,
        opacity: 1,
        color: '#1f77b4',
        fillOpacity: 0.7
    };
}

function cameraHighlightFeature(e) {
    var layer = e.target;

    layer.setStyle({
        weight: 5,
        color: '#ff7f0e',
        fillOpacity: 0.7
    });

    if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
        layer.bringToFront();
    }
    cameraInfo.update(layer.feature);
}

function cameraResetHighlight(e) {
	if (!layerLastClicked) cameraInfo.update();
	else  cameraInfo.update(layerLastClicked.feature);
    if (layerLastClicked === undefined || e.target.feature != layerLastClicked.feature) {
    	e.target.setStyle({
        weight: 2,
        opacity: 1,
        color: '#1f77b4',
        fillOpacity: 0.7
    	});
    } 
}

function cameraZoomToFeature(e) {
	// reset previous
	if(layerLastClicked != undefined) layerLastClicked.setStyle({
        weight: 2,
        opacity: 1,
        color: '#1f77b4',
        fillOpacity: 0.7
    });

	e.target.setStyle({
        weight: 5,
        color: '#ff7f0e',
        fillOpacity: 0.7
    });
    layerLastClicked = e.target;
    cameramap.fitBounds(e.target.getBounds());

	let cameraURI = e.target.feature.properties.id;
   	obsWithFeatureOfInterest = getSubjectsArray(store.getQuads(null, namedNode('http://www.w3.org/ns/sosa/hasFeatureOfInterest'), namedNode(cameraURI)));
	obsCounts = intersection(obsWithFeatureOfInterest, obsWithPropertyPassedByVehiclesCount);

    loadOverzichtPerDagGraph(e.target.feature);
	loadOverzichtPerUurGraph(e.target.feature);
	loadTimeDistribution(e.target.feature);

	$('html, body').animate({
	    scrollTop: $("#overzichtPerDag").offset().top
	}, 3000);
}

function cameraOnEachFeature(feature, layer) {
    layer.on({
        mouseover: cameraHighlightFeature,
        mouseout: cameraResetHighlight,
        click: cameraZoomToFeature
    });
}

function loadOverzichtTransitEnUniekGraph() {
	// And that is aggregated per day
	let obsWithPropertyPassedByTransitVehiclesCount = getSubjectsArray(store.getQuads(null, namedNode('http://www.w3.org/ns/sosa/observedProperty'), namedNode('https://w3id.org/cityofthings#passedByTransitVehiclesCount')));
	let obsWithPropertyPassedByUniqueVehiclesCount = getSubjectsArray(store.getQuads(null, namedNode('http://www.w3.org/ns/sosa/observedProperty'), namedNode('https://w3id.org/cityofthings#passedByUniqueVehiclesCount')));
	let layout = {
		title: 'Overzicht voertuigen (berekend overheen alle camera\'s)',
        xaxis: {
            rangeselector: {},
            rangeslider: {}
        },
        yaxis: {
            fixedrange: true
        }
	}

	let traceTransitPerDay = {
	    x: getArrayOfBeginningsOfSubjects(obsWithPropertyPassedByTransitVehiclesCount),
	    y: getObjectsArray(unpackSubjects(obsWithPropertyPassedByTransitVehiclesCount, 'http://www.w3.org/ns/sosa/hasSimpleResult')),
	    type: 'lines',
	    name: 'aantal voertuigen in transit'
	};

	let traceUniquePerDay = {
	    x: getArrayOfBeginningsOfSubjects(obsWithPropertyPassedByUniqueVehiclesCount),
	    y: getObjectsArray(unpackSubjects(obsWithPropertyPassedByUniqueVehiclesCount, 'http://www.w3.org/ns/sosa/hasSimpleResult')),
	    type: 'lines',
	    name: 'aantal unieke voertuigen'
	};

	Plotly.newPlot(document.getElementById('overzichtTransitEnUniek'), [traceTransitPerDay, traceUniquePerDay], layout);
}

function loadOverzichtPerDagGraph(feature) {
	let cameraURI = feature.properties.id;
	console.log(cameraURI)
	// And that is aggregated per day
	let obs = intersection(obsCounts, dailyObs).sort(sortSubjectsByBeginning);
	let layout = {
		title: 'Overzicht per dag',
        xaxis: {
            rangeselector: {},
            rangeslider: {}
        },
        yaxis: {
            fixedrange: true
        }
	}

	// From these observations, get phenomenonTime and hasSimpleResult
	var tracePerDay = {
	    x: getArrayOfBeginningsOfSubjects(obs),
	    y: getObjectsArray(unpackSubjects(obs, 'http://www.w3.org/ns/sosa/hasSimpleResult')),
	    type: 'lines',
	    name: 'per dag'
	};
	// Median
	let obsCountsMedian = intersection(obsWithFeatureOfInterest, obsWithPropertyPassedByVehiclesCountMedian);
	// And that is aggregated per day
	let obsDailyMedian = intersection(obsCountsMedian, dailyObs).sort(sortSubjectsByBeginning);
	var tracePerDayMedian = {
	    x: getArrayOfBeginningsOfSubjects(obsDailyMedian),
	    y: getObjectsArray(unpackSubjects(obsDailyMedian, 'http://www.w3.org/ns/sosa/hasSimpleResult')),
	    type: 'lines',
	    name: 'mediaan'
	};

	Plotly.newPlot(document.getElementById('overzichtPerDag'), [tracePerDay, tracePerDayMedian], layout);
}

function loadOverzichtPerUurGraph(feature) {
	let cameraURI = feature.properties.id;
	console.log(cameraURI);
	// And that is aggregated per hour
	let obs = intersection(obsCounts, hourlyObs).sort(sortSubjectsByBeginning);

	let layout = {
		title: 'Overzicht in detail',
        xaxis: {
            rangeselector: {},
            rangeslider: {}
        },
        yaxis: {
            fixedrange: true
        }
	}

	// From these observations, get phenomenonTime and hasSimpleResult
	var tracePerHour = {
	    x: getArrayOfBeginningsOfSubjects(obs),
	    y: getObjectsArray(unpackSubjects(obs, 'http://www.w3.org/ns/sosa/hasSimpleResult')),
	    type: 'scatter',
	    name: 'per uur'
	};

	// Median
	let obsCountsMedian = intersection(obsWithFeatureOfInterest, obsWithPropertyPassedByVehiclesCountMedian);
	let obsHourlyMedian = intersection(obsCountsMedian, hourlyObs).sort(sortSubjectsByBeginning);
	var tracePerHourMedian = {
	    x: getArrayOfBeginningsOfSubjects(obsHourlyMedian),
	    y: getObjectsArray(unpackSubjects(obsHourlyMedian, 'http://www.w3.org/ns/sosa/hasSimpleResult')),
	    type: 'lines',
	    name: 'mediaan'
	};
	Plotly.newPlot(document.getElementById('overzichtPerUur'), [tracePerHour, tracePerHourMedian], layout);
}

function loadTimeDistribution(feature) {
	let cameraURI = feature.properties.id;

	let obsWithPropertyPassedByVehiclesPerMinuteInFlowCount = getSubjectsArray(store.getQuads(null, namedNode('http://www.w3.org/ns/sosa/observedProperty'), namedNode('https://w3id.org/cityofthings#passedByVehiclesPerMinuteInFlowCount'))); //.sort(sortSubjectsByBeginning);
	let obsWithOriginCamera = getSubjectsArray(store.getQuads(null, namedNode('https://w3id.org/cityofthings#originCamera'), namedNode(cameraURI)));
	let obsForDistribution = intersection(obsWithPropertyPassedByVehiclesPerMinuteInFlowCount, obsWithOriginCamera);

	// Get unique destinationCameras
	let destinationCameras = getObjectsArray(unpackSubjects(obsForDistribution, 'https://w3id.org/cityofthings#destinationCamera')).filter((x, i, a) => a.indexOf(x) === i);

	let traces = [];
	for (let dc in destinationCameras) {
		// Don't show to itself
		if (cameraURI != destinationCameras[dc]) {
			// One trace per destinationCamera
			let obsWithDestinationCamera = obsForDistribution.filter(observationHasDestinationCamera(destinationCameras[dc]))
			let text = [];
			for (let o in obsWithDestinationCamera) {
				let t = store.getQuads(namedNode(obsWithDestinationCamera[o]), namedNode('http://www.w3.org/ns/sosa/hasSimpleResult'), null)[0].object.value 
				+ ' voertuigen deden er '
				+ store.getQuads(namedNode(obsWithDestinationCamera[o]), namedNode('https://w3id.org/cityofthings#numberOfMinutes'), null)[0].object.value
				+ ' minuten over om van '
				+ getLabelFromSubject(cameraURI)
				+ ' naar '
				+ getLabelFromSubject(destinationCameras[dc])
				+ ' te geraken';
				text.push(t);
			}
			let trace = {
			  x: getObjectsArray(unpackSubjects(obsWithDestinationCamera, 'https://w3id.org/cityofthings#numberOfMinutes')), // array of minute buckets
			  y: getObjectsArray(unpackSubjects(obsWithDestinationCamera, 'http://www.w3.org/ns/sosa/hasSimpleResult')),
			  name: getLabelFromSubject(destinationCameras[dc]),
			  type: 'bar',
			  text: text,
			  visible: (Number(dc) === 0) ? true : 'legendonly' // only show the first trace
			}
			traces.push(trace);
		}
	}

	var layout = {	title: 'Tijdsverdeling naar andere camera\'s',
					barmode: 'group',
				xaxis: {
			    title: {
			      text: 'Aantal minuten'
			    },
			  },
			  yaxis: {
			    title: {
			      text: 'Aantal voertuigen'
			    }
			  }};

	Plotly.newPlot('tijdsdistributie', traces, layout);
}

function getLabelFromSubject(subject) {
	return store.getQuads(namedNode(subject), "http://www.w3.org/2000/01/rdf-schema#label", null)[0].object.value;
}
// TRAVEL FLOWS
function getColor(d) {
    return d > 160 ? '#800026' :
    	   d > 140 ? '#bd0026' :
           d > 120  ? '#e31a1c' :
           d > 100  ? '#fc4e2a' :
           d > 80  ? '#fd8d3c' :
           d > 60   ? '#feb24c' :
           d > 40   ? '#fed976' :
           d > 20   ? '#ffeda0' :
                      '#ffffcc';
}

function flowsStyle(feature) {
    return {
        color: getColor(feature.properties.flows),
        weight: 2,
        opacity: 1,
        //color: 'white',
        // dashArray: '3',
        fillOpacity: 0.7
    };
}

function observationHappensInInterval(interval) {
	return function(observation) {
		let beginning = new Date(getBeginningFromSubject(observation));
		let end = new Date(getEndFromSubject(observation)); 
		return beginning.getTime() >= interval.start && end.getTime() <= interval.end;
	}
}

function observationHasDestinationCamera(destinationCamera) {
	return function(observation) {
		let d = store.getQuads(namedNode(observation), namedNode('https://w3id.org/cityofthings#destinationCamera'), null)[0].object.value;
		return d === destinationCamera;
	}
}

function highlightFeature(e) {
    var layer = e.target;

    layer.setStyle({
        weight: 5,
        color: '#666',
        dashArray: '',
        fillOpacity: 0.7
    });

    if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
        layer.bringToFront();
    }

    flowsInfo.update(layer.feature);
}

function resetHighlight(e) {
    travelflows.resetStyle(e.target);
    flowsInfo.update();
}

function zoomToFeature(e) {
    travelflowsmap.fitBounds(e.target.getBounds());
}

function flowsOnEachFeature(feature, layer) {
    layer.on({
        mouseover: highlightFeature,
        mouseout: resetHighlight,
        click: zoomToFeature
    });
}

function plotHeatmapPerHour(startDatetime) {
	if (travelflows) travelflows.remove();
	let featurecollection = {"type":"FeatureCollection","features": []};
	let interval = {"start": startDatetime, "end": new Date(startDatetime.getTime()+1000*60*60)};
	let obsWithPropertyPassedByVehiclesInFlowInInterval = obsWithPropertyPassedByVehiclesInFlowCount.filter(observationHappensInInterval(interval));
	for (let obs in obsWithPropertyPassedByVehiclesInFlowInInterval) {
		// Get origin and destination camera from observation
		let flows = store.getQuads(namedNode(obsWithPropertyPassedByVehiclesInFlowInInterval[obs]), namedNode('http://www.w3.org/ns/sosa/hasSimpleResult'), null)[0].object.value; 
		let origin = store.getQuads(namedNode(obsWithPropertyPassedByVehiclesInFlowInInterval[obs]), namedNode('https://w3id.org/cityofthings#originCamera'), null)[0].object.value;
		let destination = store.getQuads(namedNode(obsWithPropertyPassedByVehiclesInFlowInInterval[obs]), namedNode('https://w3id.org/cityofthings#destinationCamera'), null)[0].object.value;
		let originIndex = getSubjectsArray(cameras).indexOf(origin);
		let destinationIndex = getSubjectsArray(cameras).indexOf(destination);
		let originLabel = store.getQuads(namedNode(origin), "http://www.w3.org/2000/01/rdf-schema#label", null)[0].object.value;
		let destinationLabel = store.getQuads(namedNode(destination), "http://www.w3.org/2000/01/rdf-schema#label", null)[0].object.value;
		let latlngs = [];

		latlngs.push([ longitudes[originIndex], latitudes[originIndex]]);
		latlngs.push([ longitudes[destinationIndex], latitudes[destinationIndex]]);

		// Create feature object
		let feature = {
			"type": "Feature",
		    "properties": {
		        "name": origin + " - " + destination,
		        "flows": flows,
		        "origin": origin,
		        "destination": destination,
		        "originLabel": originLabel,
		        "destinationLabel": destinationLabel
		    },
		    "geometry": {
		    	"type":"LineString",
		    	"coordinates": latlngs
		    }
		}
		featurecollection.features.push(feature);
    }
    featurecollectionTravelflows = featurecollection;
    travelflows = L.geoJson(featurecollection, {"style": flowsStyle, "onEachFeature": flowsOnEachFeature
	}).addTo(travelflowsmap);
}

// UTIL FUNCTIONS
function intersection(array1, array2) {
	return array1.filter(value => array2.includes(value))
}

function unpackSubjectsOfQuads(quads, predicate) {
	return quads.map(function(quad) {
		return store.getQuads(quad.subject, predicate, null)[0];
	});
}

function unpackSubjects(subjects, predicate) {
	return subjects.map(function(subject) {
		return store.getQuads(namedNode(subject), predicate, null)[0];
	});
}

function unpackArrayOfSubjects(subjects, predicate) {
	return subjects.map(function(subject) {
		return store.getQuads(subject, predicate, null)[0];
	});
}

function unpackObjects(quads, predicate) {
	return quads.map(function(quad) {
		return store.getQuads(quad.object, predicate, null)[0];
	});
}

function getObjectsArray(quads) {
	return quads.map(function(quad) {
		return quad.object.value;
	});
}

function getObjectsArrayAsDate(quads) {
	return quads.map(function(quad) {
		return new Date(quad.object.value);
	});
}

function getSubjectsArray(quads) {
	return quads.map(function(quad) {
		return quad.subject.value;
	});
}

function getLatitudeArrayFromObjects(quads) {
	return quads.map(function(quad) {
		return wkt.parse(quad.object.value).coordinates[1];
	});
}

function getLongitudeArrayFromObjects(quads) {
	return quads.map(function(quad) {
		return wkt.parse(quad.object.value).coordinates[0];
	});
}

function sortQuadsObjectByDate(quadA, quadB) {
	return new Date(quadA.object.value) -  new Date(quadB.object.value);
}

function sortQuadsByBeginning(quadA, quadB) {
	// retrieve beginning timestamp
     let beginningA = getBeginningFromSubject(quadA.subject);
     let beginningB = getBeginningFromSubject(quadB.subject);
	return new Date(beginningA) -  new Date(beginningB);
}

function sortSubjectsByBeginning(subjectA, subjectB) {
	// retrieve beginning timestamp
     let beginningA = getBeginningFromSubject(subjectA);
     let beginningB = getBeginningFromSubject(subjectB);
	return new Date(beginningA) -  new Date(beginningB);
}

function getBeginningFromSubject(s) {
	return store.getQuads(store.getQuads(store.getQuads(s, namedNode('http://www.w3.org/ns/sosa/phenomenonTime'), null)[0].object, 'http://www.w3.org/2006/time#hasBeginning', null)[0].object, 'http://www.w3.org/2006/time#inXSDDateTimeStamp', null)[0].object.value;
}

function getEndFromSubject(s) {
	return store.getQuads(store.getQuads(store.getQuads(s, namedNode('http://www.w3.org/ns/sosa/phenomenonTime'), null)[0].object, 'http://www.w3.org/2006/time#hasEnd', null)[0].object, 'http://www.w3.org/2006/time#inXSDDateTimeStamp', null)[0].object.value;
}

function getArrayOfBeginningsOfSubjects(subjects) {
	return subjects.map(function(subject) {
		return getBeginningFromSubject(subject);
	}); 
}