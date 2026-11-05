const fs = require('node:fs');
const path = require('node:path');

module.exports = ({ config }) => {
  const android = { ...config.android };
  const localGoogleServicesFile = path.join(__dirname, 'google-services.json');
  const configuredGoogleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  const resolvedConfiguredFile = configuredGoogleServicesFile
    ? path.resolve(__dirname, configuredGoogleServicesFile)
    : null;
  const googleServicesFile = resolvedConfiguredFile && fs.existsSync(resolvedConfiguredFile)
    ? configuredGoogleServicesFile
    : fs.existsSync(localGoogleServicesFile)
      ? './google-services.json'
      : null;

  if (googleServicesFile) {
    android.googleServicesFile = googleServicesFile;
  } else {
    delete android.googleServicesFile;
  }

  return { ...config, android };
};
