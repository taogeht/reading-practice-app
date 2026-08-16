import type { ConfigContext, ExpoConfig } from 'expo/config';

function readApiUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!configured && process.env.EAS_BUILD === 'true') {
    throw new Error(
      'EXPO_PUBLIC_API_URL must be configured in the selected EAS environment.',
    );
  }

  const value = configured || 'http://localhost:3000';
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('EXPO_PUBLIC_API_URL must use http or https.');
  }
  if (
    process.env.EAS_BUILD === 'true' &&
    process.env.EAS_BUILD_PROFILE !== 'development' &&
    parsed.protocol !== 'https:'
  ) {
    throw new Error('Preview and production EAS builds require an HTTPS API URL.');
  }
  return parsed.origin;
}

function readAppHost(apiUrl: string): string | undefined {
  const configured = process.env.EXPO_PUBLIC_APP_HOST?.trim();
  if (!configured) {
    return process.env.EAS_BUILD === 'true' ? new URL(apiUrl).host : undefined;
  }
  if (!/^[A-Za-z0-9.-]+$/.test(configured)) {
    throw new Error(
      'EXPO_PUBLIC_APP_HOST must be a hostname such as learn.starlingrise.app.',
    );
  }
  return configured;
}

const createExpoConfig = ({ config }: ConfigContext): ExpoConfig => {
  const apiUrl = readApiUrl();
  const appHost = readAppHost(apiUrl);

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
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
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
      apiUrl,
      appHost,
      eas: {
        projectId: 'a0aba803-4290-4abc-8e03-c051d8b16fd9',
      },
    },
  };
};

export default createExpoConfig;
