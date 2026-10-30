import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';

export default function AuthLayout() {
  return (
    <ThemeProvider value={DefaultTheme}>
      <Stack initialRouteName="index" screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}
