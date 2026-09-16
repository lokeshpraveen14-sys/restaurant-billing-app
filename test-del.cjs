const https = require('https');
const url = "https://dhsafujrmxsqrsxgoifi.supabase.co/rest/v1/restaurant_tables?id=eq.123e4567-e89b-12d3-a456-426614174000&apikey=sb_publishable_wc50FKxA-mWJnyikDRT1wg_vIzFhkwD";
const options = {
  method: 'DELETE',
  headers: {
    "Authorization": "Bearer sb_publishable_wc50FKxA-mWJnyikDRT1wg_vIzFhkwD",
  }
};
const req = https.request(url, options, (res) => console.log(res.statusCode));
req.end();
