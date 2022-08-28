const LifxClient = require('lifx-lan-client').Client;
const NanoTimer = require('nanotimer');
const spotify = require('./spotify');
const { inRange, clamp } = require('lodash');

const MAX_BRIGHTNESS = 40;
const MIN_BRIGHTNESS = 5;
const MAX_SATURATION = 50;

var client = new LifxClient();
var lights = [];
var loudest = -99;
var quietest = 99;
var nextBrightness = 0;
var lastBrightness = 0;
var currColor = 0;

var beatNum = 0;
var beatTimer = new NanoTimer();
var paused = false;
var audioAnalysis;

// Control light(s) status
client.on('light-new', (light) => {
  console.log("ID: " + light.id + " connected!");

  light.on();
  lights.push(light);
});

client.on('light-online', (light) => {
  console.log("ID: " + light.id + " reconnected!");

  light.on();
});

client.on('light-offline', () => {
  console.log("A light disconnected...");

  if (beatTimer) 
    beatTimer.clearTimeout();
});

client.init();

module.exports.getLights = () => {
  return client.lights().length>0;
};

module.exports.setLightsOn = () => {
  client.lights().forEach((light) => {
    light.on();
  });
}

module.exports.setLightsOff = () => {
  client.lights().forEach((light) => {
    light.off();
  });
}

// Start sync
module.exports.initBeat = (analysis, user) => {
  audioAnalysis = analysis

  for (let i = 0; i < analysis.segments.length; i++) {
    if (analysis.segments[i].loudness_max > loudest) 
      loudest = analysis.segments[i].loudness_max;
    if (analysis.segments[i].loudness_max < quietest) 
      quietest = analysis.segments[i].loudness_max;
  }

  queryCurrentTrack(user);
};

// Control light(s) every 5th beat
const handleBeat = () => {
  if (beatNum >= audioAnalysis.segments.length || paused) {
    console.log("Track is done or paused");
    return;
  }

  nextBrightness = getBrightnessSectionLoudness();
  nextBrightness = (((MAX_BRIGHTNESS - MIN_BRIGHTNESS) / 100) * MIN_BRIGHTNESS) + nextBrightness;
  const brightnessDiff = Math.abs(nextBrightness - lastBrightness)

  if (brightnessDiff >= 5 * (MAX_BRIGHTNESS - MIN_BRIGHTNESS) / 100) {
    lastBrightness = nextBrightness;
    setColorFromWheel(nextBrightness);
  }

  beatNum++;
  if (beatNum < audioAnalysis.segments.length)
    beatTimer.setTimeout(() => handleBeat(), '', `${audioAnalysis.segments[beatNum].duration}s`);
};

// Change color
const setColorFromWheel = (brightness) => {
  currColor += 30;

  for (let i = 0; i < lights.length; i++)
    lights[i].color(currColor % 360, MAX_SATURATION, brightness, 4500, 100);
};

// Check current track every 2000 ms
const queryCurrentTrack = (user) => {
  spotify.getCurrentTrack(user, (user, track) => {
    if (!user.access_token || !track) 
      return;
    
    if (track && !track.progress_ms) {
      console.log("Couldn't get current track");
    } else {
      updateBeatNum(track.progress_ms / 1000);
      paused = !track.is_playing;
    }
  
    setTimeout(() => queryCurrentTrack(user), 2000);
  });
};

// Recalibrate segment
const updateBeatNum = (progress) => {
  for (let i = 0; i < audioAnalysis.segments.length; i++) {
    const start = audioAnalysis.segments[i].start;
    const end = start + audioAnalysis.segments[i].duration;

    if (inRange(progress, start, end)) 
      beatNum = i;
  }

  beatTimer.clearTimeout();
  handleBeat();
};

// Find current section
const getSection = () => {
  for (let i = 0; i < audioAnalysis.sections.length; i++) {
    const start = audioAnalysis.sections[i].start;
    const end = start + audioAnalysis.sections[i].duration;

    if (inRange(audioAnalysis.segments[beatNum].start, start, end)) 
      return i;
  }

  return 0;
}

// Calculate brightness based on segment and section
const getBrightnessSectionLoudness = () => {
  const segmentLoudness = audioAnalysis.segments[beatNum].loudness_max;
  const sectionLoudness = audioAnalysis.sections[getSection()].loudness;
  const maxLoudnessDiff = (loudest - quietest);

  const brightness = (segmentLoudness / sectionLoudness) * (maxLoudnessDiff / 100);
  return 100 - clamp(brightness * 100, 0, 100);
}
