const axios = require('axios');
const lightService = require('./lights');
const url = 'https://api.spotify.com/v1/'
var track;

// Get current playing track, audio analysis
module.exports.getCurrentTrack = function(user, callback) {
  let self = this ;
  
  axios({
    method: 'get',
    url: url + 'me/player/currently-playing',
    headers: {
      Authorization: `Bearer ${user.access_token}`,
    },
  })
  .then((response) => {
    var curTrack = response.data;

    if (curTrack && (track !== curTrack.item.id)) {
      console.log(`New track: ${curTrack.item.name} by ${curTrack.item.artists[0].name}`);
      track = curTrack.item.id;

      self.getAudioAnalysis(curTrack, user);
    } else {
      if (callback) 
        callback(user, curTrack);
    }
  })
  .catch((error) => {
    console.log(error || "Couldn't get current track");
  })
}

// Get audio analysis of given song, start sync
module.exports.getAudioAnalysis = function(track, user) {
  axios({
    method: 'get',
    url: url + 'audio-analysis/' + track.item.id,
    headers: {
      Authorization: `Bearer ${user.access_token}`,
    },
  })
  .then((response) => {
    var curTrack = response.data;
  
    lightService.initBeat(curTrack, user);
  })
  .catch((error) => {
    console.log(error);
  })
}
