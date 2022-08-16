const LifxClient = require('node-lifx').Client;
const _ = require('lodash');
const NanoTimer = require('nanotimer');
const spotifyService = require('./spotify');

const POLL_TIME = 2000;
const MAX_BRIGHTNESS = 50;
const MIN_BRIGHTNESS = 0;
const BEAT_THRESHHOLD = 5;
var loudest = -99;
var quietest = 99;
var brightness = 0;
var lastBrightness = 0;
var curColor = 0;
var paused = false;
var audioAnalysis;
var beatNum = 0;
var beatTimer;

var client = new LifxClient();
var lights = []

// Control status of LIFX light(s)
function getLabel(light, callback) {
  light.getLabel(function(err, data) {
    if (err) 
      return callback("Null");

    return callback(data);
  });
};

client.on('light-new', function(light) {
  getLabel(light, function(name) {
    lights.push(light);
    console.log(name + " connected!");
  });
});

client.on('light-online', function(light) {
  getLabel(light, function(name) {
    console.log(name + " reconnected!");
  });
});

client.on('light-offline', function(light) {
  console.log("A light disconnected!");

  if (beatTimer) 
    beatTimer.clearTimeout();
});

client.init();

// Return LIFX light(s)
module.exports.getLights = function() {
  return client.lights().length>0;
};

// Start sync with Spotify
module.exports.initBeat = function(analysis, user) {
  beatTimer = new NanoTimer();

  audioAnalysis = analysis;

  for (let i = 0; i < audioAnalysis.segments.length; i++) {
    if (audioAnalysis.segments[i].loudness_max > loudest) 
      loudest = audioAnalysis.segments[i].loudness_max;
    if (audioAnalysis.segments[i].loudness_max < quietest) 
      quietest = audioAnalysis.segments[i].loudness_max;
  }

  queryCurrentTrack(user);
};

// Change color and brightness based on every BEAT_THRESHHOLDth
function handleBeat() {
  if (beatNum >= audioAnalysis.segments.length || paused) {
    console.log("Track is done or paused");
    return;
  }

  brightness = getBrightnessSectionLoudness();
  brightness = MIN_BRIGHTNESS + brightness * (MAX_BRIGHTNESS - MIN_BRIGHTNESS) / 100;
  const brightnessDiff = Math.abs(brightness - lastBrightness)

  if (brightnessDiff >= BEAT_THRESHHOLD * (MAX_BRIGHTNESS - MIN_BRIGHTNESS) / 100) {
    lastBrightness = brightness;
    setColorFromWheel(brightness);
  }

  beatNum++;
  if (beatNum < audioAnalysis.segments.length)
    beatTimer.setTimeout(() => handleBeat(), '', `${audioAnalysis.segments[beatNum].duration}s`);
};

// Change LIFX light(s) color
function setColorFromWheel(brightness) {
  curColor += 30;

  client.lights().forEach(function(light) {
    light.color(curColor % 360, 50, brightness, 4500, 150);
  });
};

// Timer for when to check current timestamp in song
function queryCurrentTrack(user) {
  spotifyService.getCurrentTrack(user, function(user, body) {
    if (!body.progress_ms) {
      console.log("Couldn't get current track");
    } else {
      updateBeatNum(body.progress_ms / 1000);
      paused = !body.is_playing;
    }
  
    setTimeout(() => queryCurrentTrack(user), POLL_TIME);
  });
};

// Recalibrate to correct beat based on current progress
function updateBeatNum(progress) {
  for (let i = 0; i < audioAnalysis.segments.length; i++) {
    const start = audioAnalysis.segments[i].start;
    const end = start + audioAnalysis.segments[i].duration;

    if (_.inRange(progress, start, end)) beatNum = i;
  }

  beatTimer.clearTimeout();
  handleBeat();
};

// Get current section based on current segment 
function getSection() {
  for (let i = 0; i < audioAnalysis.sections.length; i++) {
    const start = audioAnalysis.sections[i].start;
    const end = start + audioAnalysis.sections[i].duration;

    if (_.inRange(audioAnalysis.segments[beatNum].start, start, end)) return i;
  }

  return 0;
}

// Get the brightness for lights based on section loudness
function getBrightnessSectionLoudness() {
  const beatLoudness = audioAnalysis.segments[beatNum].loudness_max;
  const trackLoudness = audioAnalysis.sections[getSection()].loudness;
  const maxLoudnessDiff = (loudest - quietest);

  const brightness = (beatLoudness / trackLoudness) * (maxLoudnessDiff / 100);

  return 100 - _.clamp(brightness * 100, 0, 100);
}
