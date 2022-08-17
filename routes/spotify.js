const axios = require('axios');
const lights = require('./lights');
var track;

// Get current playing track, control spotify status, fetch audio analysis
module.exports.getCurrentTrack = (user, callback) => {
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
      console.log(`New track: ${curTrack.item.name} by ${curTrack.item.artists[0].name}...`);
      track = curTrack.item.id;
      
      this.getAudioAnalysis(curTrack, user);
    } else if (callback) {
      callback(user, curTrack);
    }
  })
  .catch((error) => {
    console.log(error || "Couldn't find spotify...");
  })
}

// Get audio analysis of given song, start sync
module.exports.getAudioAnalysis = (track, user) => {
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
