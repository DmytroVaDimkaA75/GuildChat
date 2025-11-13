const { google } = require('google-auth-library');
const key = require('./serviceAccountKey.json');

async function getAccessToken() {
  const client = new google.auth.JWT(
    key.client_email,
    null,
    key.private_key,
    ['https://www.googleapis.com/auth/firebase.messaging']
  );

  const token = await client.authorize();
  console.log(token.access_token);
}

getAccessToken();
