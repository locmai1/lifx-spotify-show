require('dotenv').config();
const { URLSearchParams } = require('url');
const { getLights } = require('./services/lights');
const spotifyService = require('./services/spotify');
const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const stateKey = 'spotify_auth_state';
var user;

const app = express();
app.set('view engine', 'pug');
app.use(express.static(__dirname + '/public'))
   .use(cookieParser());

// Generate a random string for Spotify OAuth
const generateRandomString = (length) => {
  var text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  for (var i = 0; i < length; i++) 
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  
  return text;
}

// Backend for logging into Spotify
app.get('/login', (req, res) => {
  const state = generateRandomString();
  res.cookie(stateKey, state);

  const scope = 'user-read-private user-read-email user-read-playback-state';
  const queryParams = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.CLIENT_ID,
    scope: scope,
    redirect_uri: process.env.REDIRECT_URI,
    state: state
  })
  res.redirect(`https://accounts.spotify.com/authorize?${queryParams}`);
});

// Callback for after logging into Spotify
app.get('/callback', (req, res) => {
  const code = req.query.code || null;

  axios({
    method: 'post',
    url: 'https://accounts.spotify.com/api/token',
    data: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: process.env.REDIRECT_URI,
    }),
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${new Buffer.from(`${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`).toString('base64')}`,
    },
  })
  .then((response) => {
    if (response.status === 200) {
      const { access_token, token_type } = response.data;

      axios.get('https://api.spotify.com/v1/me', {
        headers: {
          Authorization: `${token_type} ${access_token}`
        }
      })
      .then((response) => {
        user = response.data;
        user.access_token = access_token;
        res.redirect('/user');
      })
      .catch((error) => {
        res.redirect(`/error?${new URLSearchParams({
          error: error
        })}`);
      })
    }
  })
  .catch((error) => {
    res.redirect(`/error?${new URLSearchParams({
      error: 'invalid_token'
    })}`);
  })
});

// Get a new access_token from refresh_token after expiration
app.get('/refresh_token', (req, res) => {
  const { refresh_token } = req.query.refresh_token;

  axios({
    method: 'post',
    url: 'https://accounts.spotify.com/api/token',
    data: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    }),
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${new Buffer.from(`${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`).toString('base64')}`,
    },
  })
  .then((response) => {
    const data = response.data;
    const access_token = data.access_token;
    res.send({
      'access_token': access_token,
    });
  })
  .catch((error) => {
    res.redirect(`/error?${new URLSearchParams({
      error: error
    })}`);
  })
})

// Upon login, redirect based on lights status
app.get('/user', (req, res) => {
  if (!user) {
    res.redirect('/');
    return;
  }

  if (getLights()) {
    res.redirect('/go');
    return;
  }

  res.render('user', {
    user: user,
  });
})

// Start sync if lights available
app.get('/go', (req, res) => {
  if(!user && !getLights()) {
    res.redirect('/');
    return;
  }

  if (user && !getLights()) {
    res.redirect('/user');
    return;
  }

  res.render('ready', {
    user: user
  });

  spotifyService.getCurrentTrack(user);    
});

// Catch errors if any
app.get('/error', (req, res) => {
  if(!req.query.msg) {
    res.redirect('/');
    return;
  }

  res.render('error', {
    error: req.query.msg
  });
});

app.listen(process.env.PORT, () => {
  console.log(`Listening on port ${process.env.PORT}`);
});
