const LifxClient = require('node-lifx').Client;
const NanoTimer = require('nanotimer');
const spotify = require('./spotify');
const { inRange, clamp } = require('lodash');

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
var lights = [];

// Control status of LIFX light(s)
const getLabel = (light, callback) => {
  light.getLabel((error, data) => {
    if (error) 
      return callback("null");

    return callback(data);
  });
};

client.on('light-new', (light) => {
  getLabel(light, (name) => {
    lights.push(light);
    console.log(name + " connected!");
  });
});

client.on('light-online', (light) => {
  getLabel(light, (name) => {
    console.log(name + " reconnected!");
  });
});

client.on('light-offline', () => {
  console.log("A light disconnected...");

  if (beatTimer) 
    beatTimer.clearTimeout();
});

client.init();

// Control LIFX light(s)
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

// Start sync with Spotify
module.exports.initBeat = (analysis, user) => {
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
const handleBeat = () => {
  if (beatNum >= audioAnalysis.segments.length || paused) {
    console.log("Track is done/paused...");
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
const setColorFromWheel = (brightness) => {
  curColor += 30;

  client.lights().forEach((light) => {
    light.color(curColor % 360, 50, brightness, 4500, 150);
  });
};

// Timer for when to check current timestamp in song
const queryCurrentTrack = (user) => {
  spotify.getCurrentTrack(user, (user, track) => {
    if (!user.access_token) 
      return;
    
    if (!track.progress_ms) {
      console.log("Couldn't get current track...");
    } else {
      updateBeatNum(track.progress_ms / 1000);
      paused = !track.is_playing;
    }
  
    setTimeout(() => queryCurrentTrack(user), POLL_TIME);
  });
};

// Recalibrate to correct beat based on current progress
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

// Get current section based on current segment 
const getSection = () => {
  for (let i = 0; i < audioAnalysis.sections.length; i++) {
    const start = audioAnalysis.sections[i].start;
    const end = start + audioAnalysis.sections[i].duration;

    if (inRange(audioAnalysis.segments[beatNum].start, start, end)) 
      return i;
  }

  return 0;
}

// Get the brightness for lights based on section loudness
const getBrightnessSectionLoudness = () => {
  const beatLoudness = audioAnalysis.segments[beatNum].loudness_max;
  const trackLoudness = audioAnalysis.sections[getSection()].loudness;
  const maxLoudnessDiff = (loudest - quietest);

  const brightness = (beatLoudness / trackLoudness) * (maxLoudnessDiff / 100);

  return 100 - clamp(brightness * 100, 0, 100);
}
