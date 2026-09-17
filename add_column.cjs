const https = require('https');
const data = JSON.stringify({
  query: "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS role_permissions JSONB;"
});
const options = {
  hostname: 'dhsafujrmxsqrsxgoifi.supabase.co',
  path: '/rest/v1/', // wait, rest API doesn't support raw SQL
};
