import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const appHost = process.env.EXPO_PUBLIC_APP_HOST?.trim();

  return {
    ...config,
    name: 'Starling Rise',
    slug: 'starling-rise',
    version: '0.1.0',
    orientation: 'default',
    scheme: 'starlingrise',
    userInterfaceStyle: 'light',
    plugins: [
      'expo-router',
      'expo-secure-store',
      [
        'expo-camera',
        {
          cameraPermission:
            'Let Starling Rise use the camera when you choose to scan your learning QR code.',
          barcodeScannerEnabled: true,
        },
      ],
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.starlingrise.student',
      associatedDomains: appHost ? [`applinks:${appHost}`] : [],
    },
    android: {
      package: 'com.starlingrise.student',
      adaptiveIcon: {
        backgroundColor: '#F5F8F2',
      },
      intentFilters: appHost
        ? [
            {
              action: 'VIEW',
              autoVerify: true,
              data: [
                { scheme: 'https', host: appHost, pathPrefix: '/s' },
                { scheme: 'https', host: appHost, pathPrefix: '/c' },
              ],
              category: ['BROWSABLE', 'DEFAULT'],
            },
          ]
        : [],
    },
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
      appHost: appHost ?? null,
    },
  };
};
