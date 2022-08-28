const axios = require('axios');
const lights = require('./lights');
var track;



// Get audio analysis of given song, start sync
const getAudioAnalysis = (track, user) => {
  if (!user.access_token) 
    return;

  axios({
    method: 'get',
    url: 'https://api.spotify.com/v1/audio-analysis/' + track.item.id,
    headers: {
      Authorization: `Bearer ${user.access_token}`,
    },
  })
  .then((response) => {
    var curTrack = response.data;
  
    lights.initBeat(curTrack, user);
  })
  .catch((error) => {
    console.log(error);
  })
}

// Get current playing track, control spotify status, fetch audio analysis
const getCurrentTrack = (user, callback) => {
  if (!user.access_token) 
    return;

  axios({
    method: 'get',
    url: 'https://api.spotify.com/v1/me/player/currently-playing',
    headers: {
      Authorization: `Bearer ${user.access_token}`,
    },
  })
  .then((response) => {
    var curTrack = response.data;

    if (curTrack && track !== curTrack.item.id) {
      console.log(`New track: ${curTrack.item.name} by ${getArtistsNames(curTrack).join(", ")}`);

      track = curTrack.item.id;
      
      getAudioAnalysis(curTrack, user);
    } else if (callback) {
      callback(user, curTrack);
    }
  })
  .catch((error) => {
    console.log(error || "Couldn't find spotify");
  })
}

// Get all artists names from given track
const getArtistsNames = (track) => {
  var names = [];

  track.item.artists.forEach((artist) => {
    names.push(artist.name);
  })

  return names;
}

module.exports = {
  getCurrentTrack,
  getAudioAnalysis
}
