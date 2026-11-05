# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

## Voice and video calls

Mobile calls use native WebRTC and are available while the app is open. Expo Go does not include the required native module, so install a development client and rebuild after installing dependencies or changing the native app configuration:

```bash
npx expo install expo-dev-client
npx expo run:android
# or
npx expo run:ios
```

Incoming calls while the app is backgrounded or terminated are not supported yet.

## Android push notifications (FCM)

The Expo notification, device, and application packages are declared in this app.
Register an Android app in the Firebase project used by `src/lib/firebase.ts`,
using the Android package name from `app.json` (`com.mojancko01.mobileapp`), and
put its downloaded `google-services.json` in this directory. The config already
points Expo at that file. Keep the Firebase Admin service-account JSON on the
backend only; never put it in this app.

On a physical Android device, `src/lib/pushNotifications.ts` requests notification
permission, retrieves the native FCM token (not an Expo push token), and sends it
to the authenticated `POST /api/users/push-token` endpoint. The root layout
registers the signed-in user's device. Rebuild the native app after adding or
changing `google-services.json`:

```bash
npx expo prebuild --platform android
npx expo run:android
```

New direct and group messages, incoming audio/video calls, and missed calls send
a visible Android notification when a registered device token is available.
These are standard notifications, not a full-screen Android call UI.

You can start developing by editing the files inside the **src/app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **example** directory and create a blank **src/app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
