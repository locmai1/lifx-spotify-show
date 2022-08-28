require('dotenv').config();
const { URLSearchParams } = require('url');
const { getLights, setLightsOff, setLightsOn } = require('./routes/lights');
const { join } = require('path');
const spotify = require('./routes/spotify');
const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const stateKey = 'spotify_auth_state';
var user;

const app = express();
app.set('view engine', 'pug');
app.use(cookieParser());
app.use(express.static(join(__dirname, '/public')));

const generateRandomString = (length) => {
  var text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  for (var i = 0; i < length; i++) 
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  
  return text;
}

// Router
app.get('/login', (req, res) => {
  const state = generateRandomString();
  res.cookie(stateKey, state);

  const scope = 'user-read-private user-read-email user-read-playback-state';
  const queryParams = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.CLIENT_ID,
    scope: scope,
    redirect_uri: process.env.REDIRECT_URI,
    state: state,
    show_dialog: true,
  });
  res.redirect(`https://accounts.spotify.com/authorize?${queryParams}`);
});

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
        console.log(error);
      })
    }
  })
  .catch((error) => {
    console.log(error || 'invalid token');
  })
});

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
    console.log(error);
  })
})

app.get('/', (req, res) => {
  if (user && user.access_token) {
    res.redirect('/user');
    return;
  }

  res.render('login');
})

app.get('/user', (req, res) => {
  if (!user || !user.access_token) {
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
});

app.get('/go', (req, res) => {
  if(!user || !user.access_token) {
    res.redirect('/');
    return;
  }

  if (!getLights()) {
    res.redirect('/user');
    return;
  }

  res.render('ready', {
    user: user
  });

  spotify.getCurrentTrack(user);
});

app.get('/go/:status', (req, res) => {
  var status = req.params.status;

  if(!user || !user.access_token) {
    res.redirect('/');
    return;
  }

  if (!getLights()) {
    res.redirect('/user');
    return;
  }

  if (status == 'off') {
    setLightsOff();
    console.log("Lights off");

    res.redirect('/go');
    return;
  } 

  if (status == 'on') {
    setLightsOn();
    console.log("Lights on");

    res.redirect('/go');
    return;
  }

  res.redirect('/');
});

app.get('/logout', (req, res) => {
  if (!user || !user.access_token) {
    res.redirect('/');
    return;
  }

  setLightsOff();
  user.access_token = null;

  res.redirect('//accounts.spotify.com/en/logout');
  console.log('User logged out');
});

app.listen(process.env.PORT, () => {
  console.log(`Listening on port ${process.env.PORT}`);
});
