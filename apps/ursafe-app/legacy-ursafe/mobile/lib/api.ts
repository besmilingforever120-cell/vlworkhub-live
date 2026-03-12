import Constants from 'expo-constants';

const DEFAULT_API_URL = 'http://10.0.0.78:3000';

const getDevServerApiUrl = () => {
  const expoConfig = Constants.expoConfig as { hostUri?: string } | undefined;
  const manifest = Constants.manifest as { debuggerHost?: string } | undefined;
  const manifest2 = (Constants as { manifest2?: { extra?: { expoClient?: { hostUri?: string } } } }).manifest2;
  const hostUri = expoConfig?.hostUri ?? manifest2?.extra?.expoClient?.hostUri ?? manifest?.debuggerHost;
  if (!hostUri) {
    return undefined;
  }
  const host = hostUri.split(':')[0];
  return host ? `http://${host}:3000` : undefined;
};

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  getDevServerApiUrl() ||
  DEFAULT_API_URL;
